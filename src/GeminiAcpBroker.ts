import {
  DEFAULT_REQUEST_TIMEOUT_MS,
  ACP_METHOD_SESSION_NEW,
  ACP_METHOD_SESSION_LOAD,
  ACP_METHOD_SESSION_SET_MODE,
  ACP_METHOD_SESSION_SET_MODEL,
  ACP_METHOD_SESSION_PROMPT,
  ACP_METHOD_SESSION_CANCEL,
} from "./constants";
import {
  type GeminiAcpSessionResponse,
  type GeminiAcpNotificationEnvelope,
  type GeminiAcpPermissionRequest,
  type GeminiSessionUpdate,
  type GeminiContentBlock,
  type GeminiAcpPromptResponse,
  type GeminiLogger,
} from "./types";
import { JsonRpcStdioClient } from "./JsonRpcStdioClient";
import { GeminiProtocolError } from "./errors";
import { readSessionId, readSessionModelId, trimToUndefined } from "./utils";

interface BrokerRoute {
  readonly onSessionUpdate: (update: GeminiSessionUpdate) => void;
  readonly onPermissionRequest: (request: GeminiAcpPermissionRequest) => Promise<unknown>;
  readonly onBrokerClose: (input: {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error | undefined;
  }) => void;
}

export class GeminiAcpBroker {
  readonly binaryPath: string;
  readonly cwd: string;

  #routes = new Map<string, BrokerRoute>();

  private constructor(
    private readonly client: JsonRpcStdioClient,
    input: {
      readonly binaryPath: string;
      readonly cwd: string;
    },
    private logger?: GeminiLogger
  ) {
    this.binaryPath = input.binaryPath;
    this.cwd = input.cwd;
  }

  static async start(input: {
    readonly binaryPath: string;
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv | undefined;
    readonly onProtocolError?: ((error: Error) => void) | undefined;
    readonly logger?: GeminiLogger | undefined;
  }) {
    let broker!: GeminiAcpBroker;
    const client = await JsonRpcStdioClient.start({
      binaryPath: input.binaryPath,
      cwd: input.cwd,
      ...(input.env ? { env: input.env } : {}),
      onSessionUpdate: (envelope) => broker?.handleSessionUpdate(envelope),
      onPermissionRequest: async (request) => await broker?.handlePermissionRequest(request),
      onClose: (closeInput) => broker?.handleClose(closeInput),
      ...(input.onProtocolError ? { onProtocolError: input.onProtocolError } : {}),
      ...(input.logger ? { logger: input.logger } : {}),
    });
    broker = new GeminiAcpBroker(client, input, input.logger);
    return broker;
  }

  get stderr(): string {
    return this.client.stderr;
  }

  get isClosed(): boolean {
    return this.client.isClosed;
  }

  get closed(): Promise<void> {
    return this.client.closed;
  }

  async openSession(input: {
    readonly cwd: string;
    readonly mode: "yolo" | "plan";
    readonly createRoute: (sessionId: string) => BrokerRoute;
    readonly resumeSessionId?: string | undefined;
    readonly model?: string | undefined;
  }) {
    let sessionId: string;
    let currentModel: string | undefined;
    let routeRegistered = false;
    let route: BrokerRoute | undefined;

    try {
      if (input.resumeSessionId) {
        this.logger?.debug?.("Loading existing session...", { sessionId: input.resumeSessionId });
        sessionId = input.resumeSessionId;
        route = input.createRoute(sessionId);
        this.#routes.set(sessionId, route);
        routeRegistered = true;
        const response = await this.client.request<GeminiAcpSessionResponse>(
          ACP_METHOD_SESSION_LOAD,
          {
            sessionId: input.resumeSessionId,
            cwd: input.cwd,
            mcpServers: [],
          },
          DEFAULT_REQUEST_TIMEOUT_MS
        );
        currentModel = readSessionModelId(response) ?? input.model;
      } else {
        this.logger?.debug?.("Creating new session...");
        const response = await this.client.request<GeminiAcpSessionResponse>(
          ACP_METHOD_SESSION_NEW,
          {
            cwd: input.cwd,
            mcpServers: [],
          },
          DEFAULT_REQUEST_TIMEOUT_MS
        );
        const newSessionId = readSessionId(response);
        if (!newSessionId) {
          throw new GeminiProtocolError("Gemini ACP session/new did not return a session id.");
        }
        sessionId = newSessionId;
        this.logger?.debug?.("New session created", { sessionId });
        route = input.createRoute(sessionId);
        this.#routes.set(sessionId, route);
        routeRegistered = true;
        currentModel = readSessionModelId(response) ?? input.model;
      }

      // Set initial mode
      const modeId = input.mode === "plan" ? "plan" : "yolo";
      this.logger?.debug?.("Setting session mode...", { sessionId, modeId });
      await this.client.request(
        ACP_METHOD_SESSION_SET_MODE,
        {
          sessionId,
          modeId,
        },
        DEFAULT_REQUEST_TIMEOUT_MS
      );

      // Set model if provided
      if (input.model) {
        this.logger?.debug?.("Setting session model...", { sessionId, model: input.model });
        await this.client.request(
          ACP_METHOD_SESSION_SET_MODEL,
          {
            sessionId,
            modelId: input.model,
          },
          DEFAULT_REQUEST_TIMEOUT_MS
        );
        currentModel = input.model;
      }

      return {
        sessionId,
        currentModel,
      };
    } catch (error) {
      if (routeRegistered && sessionId!) {
        this.#routes.delete(sessionId);
      }
      this.logger?.error?.("Failed to open session", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  async setMode(sessionId: string, modeId: "yolo" | "plan") {
    this.logger?.debug?.("Setting mode...", { sessionId, modeId });
    await this.client.request(
      ACP_METHOD_SESSION_SET_MODE,
      {
        sessionId,
        modeId,
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  }

  async setModel(sessionId: string, modelId: string) {
    this.logger?.debug?.("Setting model...", { sessionId, modelId });
    await this.client.request(
      ACP_METHOD_SESSION_SET_MODEL,
      {
        sessionId,
        modelId,
      },
      DEFAULT_REQUEST_TIMEOUT_MS
    );
  }

  async prompt(sessionId: string, prompt: readonly GeminiContentBlock[]) {
    this.logger?.debug?.("Sending prompt...", { sessionId, blockCount: prompt.length });
    return await this.client.request<GeminiAcpPromptResponse>(
      ACP_METHOD_SESSION_PROMPT,
      {
        sessionId,
        prompt,
      }
    );
  }

  cancel(sessionId: string) {
    this.logger?.debug?.("Cancelling session...", { sessionId });
    this.client.notify(ACP_METHOD_SESSION_CANCEL, {
      sessionId,
    });
  }

  bindSession(sessionId: string, route: BrokerRoute) {
    this.logger?.debug?.("Binding session route...", { sessionId });
    this.#routes.set(sessionId, route);
  }

  releaseSession(sessionId: string) {
    this.logger?.debug?.("Releasing session route...", { sessionId });
    this.#routes.delete(sessionId);
  }

  async stop() {
    this.logger?.info?.("Stopping broker...");
    await this.client.stop();
  }

  private handleSessionUpdate(envelope: GeminiAcpNotificationEnvelope) {
    const sessionId = trimToUndefined(envelope.sessionId);
    const update = envelope.update;
    if (!sessionId || !update) {
      return;
    }
    this.#routes.get(sessionId)?.onSessionUpdate(update);
  }

  private async handlePermissionRequest(request: GeminiAcpPermissionRequest) {
    const sessionId = trimToUndefined(request.sessionId);
    const route = sessionId ? this.#routes.get(sessionId) : undefined;
    if (!route) {
      this.logger?.warn?.("Permission request for unknown session", { sessionId });
      return {
        outcome: {
          outcome: "cancelled" as const,
        },
      };
    }
    return await route.onPermissionRequest(request);
  }

  private handleClose(input: {
    readonly code: number | null;
    readonly signal: NodeJS.Signals | null;
    readonly stderr: string;
    readonly error?: Error | undefined;
  }) {
    this.logger?.error?.("Broker connection closed", {
      code: input.code,
      signal: input.signal,
      hasError: !!input.error,
    });
    const routes = Array.from(this.#routes.values());
    this.#routes.clear();
    for (const route of routes) {
      route.onBrokerClose(input);
    }
  }
}
