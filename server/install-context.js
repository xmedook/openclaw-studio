const os = require("node:os");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { resolveHosts, isPublicHost } = require("./network-policy");
const { readOpenclawGatewayDefaults } = require("./studio-settings");

const execFileAsync = promisify(execFile);
const OPENCLAW_PROBE_TIMEOUT_MS = 1_500;
const TAILSCALE_PROBE_TIMEOUT_MS = 1_200;

const normalizeErrorCode = (error) => {
  if (!error || typeof error !== "object") return "";
  if (typeof error.code === "string") return error.code.trim();
  return "";
};

const normalizeErrorMessage = (error) => {
  if (error instanceof Error) {
    return error.message.trim();
  }
  return "";
};

const normalizeJsonValue = (value) => {
  if (!value || typeof value !== "object") return null;
  return value;
};

const runJsonCommand = async (command, args, timeoutMs, runner = execFileAsync) => {
  try {
    const { stdout } = await runner(command, args, {
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      encoding: "utf8",
    });
    const parsed = JSON.parse(String(stdout ?? "").trim());
    return {
      available: true,
      ok: true,
      value: normalizeJsonValue(parsed),
      error: null,
    };
  } catch (error) {
    const code = normalizeErrorCode(error);
    const message = normalizeErrorMessage(error);
    const timedOut =
      code === "ETIMEDOUT" ||
      code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" ||
      message.toLowerCase().includes("timed out");
    if (code === "ENOENT") {
      return {
        available: false,
        ok: false,
        value: null,
        error: "cli_not_found",
      };
    }
    return {
      available: true,
      ok: false,
      value: null,
      error: timedOut ? "probe_timeout" : message || "probe_failed",
    };
  }
};

const normalizeDnsName = (value) => {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  return trimmed.replace(/\.$/, "");
};

const probeTailscale = async (env = process.env, runner = execFileAsync) => {
  const result = await runJsonCommand(
    "tailscale",
    ["status", "--json"],
    TAILSCALE_PROBE_TIMEOUT_MS,
    runner
  );
  if (!result.available) {
    return {
      installed: false,
      loggedIn: false,
      dnsName: null,
    };
  }
  const parsed = result.value;
  const backendState =
    parsed && typeof parsed.BackendState === "string" ? parsed.BackendState.trim() : "";
  const dnsName = normalizeDnsName(parsed && parsed.Self ? parsed.Self.DNSName : "");
  const loggedIn =
    result.ok &&
    backendState !== "NeedsLogin" &&
    backendState !== "NoState" &&
    backendState !== "Stopped";
  return {
    installed: true,
    loggedIn,
    dnsName: loggedIn ? dnsName : null,
  };
};

const probeLocalGateway = async (runner = execFileAsync) => {
  const [statusProbe, sessionsProbe] = await Promise.all([
    runJsonCommand("openclaw", ["status", "--json"], OPENCLAW_PROBE_TIMEOUT_MS, runner),
    runJsonCommand("openclaw", ["sessions", "--json"], OPENCLAW_PROBE_TIMEOUT_MS, runner),
  ]);
  const issues = Array.from(
    new Set([statusProbe.error, sessionsProbe.error].filter((value) => typeof value === "string" && value))
  );
  return {
    cliAvailable: statusProbe.available || sessionsProbe.available,
    statusProbeOk: statusProbe.ok,
    sessionsProbeOk: sessionsProbe.ok,
    probeHealthy: statusProbe.ok || sessionsProbe.ok,
    issues,
  };
};

const resolveRemoteShell = (env = process.env) => {
  return Boolean(
    String(env.SSH_CONNECTION ?? "").trim() ||
      String(env.SSH_CLIENT ?? "").trim() ||
      String(env.SSH_TTY ?? "").trim()
  );
};

const resolveHostname = () => {
  const hostname = String(os.hostname?.() ?? "").trim();
  return hostname || null;
};

async function detectInstallContext(env = process.env, options = {}) {
  const resolveHostsImpl = options.resolveHosts || resolveHosts;
  const isPublicHostImpl = options.isPublicHost || isPublicHost;
  const readOpenclawGatewayDefaultsImpl =
    options.readOpenclawGatewayDefaults || readOpenclawGatewayDefaults;
  const runCommand = options.runCommand || execFileAsync;
  const configuredHosts = Array.from(
    new Set(resolveHostsImpl(env).map((value) => String(value ?? "").trim()).filter(Boolean))
  );
  const publicHosts = configuredHosts.filter((host) => isPublicHostImpl(host));
  const localDefaults = readOpenclawGatewayDefaultsImpl(env);
  const [localGatewayProbe, tailscale] = await Promise.all([
    probeLocalGateway(runCommand),
    probeTailscale(env, runCommand),
  ]);

  return {
    studioHost: {
      hostname: resolveHostname(),
      configuredHosts,
      publicHosts,
      loopbackOnly: publicHosts.length === 0,
      remoteShell: resolveRemoteShell(env),
      studioAccessTokenConfigured: Boolean(String(env.STUDIO_ACCESS_TOKEN ?? "").trim()),
    },
    localGateway: {
      defaultsDetected: Boolean(localDefaults?.url),
      url: localDefaults?.url ?? null,
      hasToken: Boolean(localDefaults?.token),
      cliAvailable: localGatewayProbe.cliAvailable,
      statusProbeOk: localGatewayProbe.statusProbeOk,
      sessionsProbeOk: localGatewayProbe.sessionsProbeOk,
      probeHealthy: localGatewayProbe.probeHealthy,
      issues: localGatewayProbe.issues,
    },
    tailscale,
  };
}

function buildStartupGuidance(params) {
  const installContext = params.installContext;
  const port = Number.isFinite(params.port) && params.port > 0 ? params.port : 3000;
  const hostLabel =
    installContext.tailscale.dnsName ||
    installContext.studioHost.publicHosts[0] ||
    "<studio-host>";
  const sshTarget = installContext.tailscale.dnsName || hostLabel;
  const lines = [];

  if (installContext.studioHost.remoteShell && installContext.studioHost.loopbackOnly) {
    lines.push(
      `Studio is running on a remote host. http://localhost:${port} only opens on that machine.`
    );
    if (installContext.localGateway.defaultsDetected || installContext.localGateway.probeHealthy) {
      lines.push("If OpenClaw is on this same host, keep Studio's upstream at ws://localhost:18789.");
    }
    if (installContext.tailscale.loggedIn && installContext.tailscale.dnsName) {
      lines.push(
        `Recommended: tailscale serve --yes --bg --https 443 http://127.0.0.1:${port}`
      );
      lines.push(`Then open: https://${installContext.tailscale.dnsName}`);
    } else {
      lines.push("Recommended: install/login to Tailscale, or keep Studio on loopback and use SSH tunneling.");
    }
    lines.push(`SSH tunnel fallback: ssh -L ${port}:127.0.0.1:${port} ${sshTarget}`);
    return lines;
  }

  if (installContext.studioHost.publicHosts.length > 0) {
    lines.push(`Studio is exposed on ${installContext.studioHost.publicHosts.join(", ")}.`);
    if (installContext.studioHost.studioAccessTokenConfigured) {
      lines.push("Open /?access_token=... once from each new browser to set the Studio access cookie.");
    }
    if (installContext.localGateway.defaultsDetected || installContext.localGateway.probeHealthy) {
      lines.push("If OpenClaw is on this same host, keep Studio's upstream at ws://localhost:18789.");
    }
    return lines;
  }

  return lines;
}

module.exports = {
  detectInstallContext,
  buildStartupGuidance,
};
