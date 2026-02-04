import { useCallback, useEffect, useState } from "react";
import {
  AGENT_FILE_NAMES,
  createAgentFilesState,
  isAgentFileName,
  type AgentFileName,
} from "@/lib/agents/agentFiles";
import { invokeGatewayTool } from "@/lib/gateway/tools";

type AgentFilesState = ReturnType<typeof createAgentFilesState>;

type UseAgentFilesEditorResult = {
  agentFiles: AgentFilesState;
  agentFileTab: AgentFileName;
  agentFilesLoading: boolean;
  agentFilesSaving: boolean;
  agentFilesDirty: boolean;
  agentFilesError: string | null;
  setAgentFileContent: (value: string) => void;
  handleAgentFileTabChange: (nextTab: AgentFileName) => Promise<void>;
  saveAgentFiles: () => Promise<boolean>;
};

const extractToolText = (result: unknown) => {
  if (!result || typeof result !== "object") return "";
  const record = result as Record<string, unknown>;
  if (typeof record.text === "string") return record.text;
  const content = record.content;
  if (!Array.isArray(content)) return "";
  const blocks = content
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const block = item as Record<string, unknown>;
      if (block.type !== "text" || typeof block.text !== "string") return null;
      return block.text;
    })
    .filter((text): text is string => Boolean(text));
  return blocks.join("");
};

const isMissingFileError = (message: string) => /no such file|enoent/i.test(message);

export const useAgentFilesEditor = (sessionKey: string | null | undefined): UseAgentFilesEditorResult => {
  const [agentFiles, setAgentFiles] = useState(createAgentFilesState);
  const [agentFileTab, setAgentFileTab] = useState<AgentFileName>(AGENT_FILE_NAMES[0]);
  const [agentFilesLoading, setAgentFilesLoading] = useState(false);
  const [agentFilesSaving, setAgentFilesSaving] = useState(false);
  const [agentFilesDirty, setAgentFilesDirty] = useState(false);
  const [agentFilesError, setAgentFilesError] = useState<string | null>(null);

  const loadAgentFiles = useCallback(async () => {
    setAgentFilesLoading(true);
    setAgentFilesError(null);
    try {
      const trimmedSessionKey = sessionKey?.trim();
      if (!trimmedSessionKey) {
        setAgentFiles(createAgentFilesState());
        setAgentFilesDirty(false);
        setAgentFilesError("Session key is missing for this agent.");
        return;
      }
      const results = await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const response = await invokeGatewayTool({
            tool: "read",
            sessionKey: trimmedSessionKey,
            args: { path: name },
          });
          if (!response.ok) {
            if (isMissingFileError(response.error)) {
              return { name, content: "", exists: false };
            }
            throw new Error(response.error);
          }
          return {
            name,
            content: extractToolText(response.result),
            exists: true,
          };
        })
      );
      const nextState = createAgentFilesState();
      for (const file of results) {
        if (!isAgentFileName(file.name)) continue;
        nextState[file.name] = {
          content: file.content ?? "",
          exists: Boolean(file.exists),
        };
      }
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load agent files.";
      setAgentFilesError(message);
    } finally {
      setAgentFilesLoading(false);
    }
  }, [sessionKey]);

  const saveAgentFiles = useCallback(async () => {
    setAgentFilesSaving(true);
    setAgentFilesError(null);
    try {
      const trimmedSessionKey = sessionKey?.trim();
      if (!trimmedSessionKey) {
        setAgentFilesError("Session key is missing for this agent.");
        return false;
      }
      await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const response = await invokeGatewayTool({
            tool: "write",
            sessionKey: trimmedSessionKey,
            args: { path: name, content: agentFiles[name].content },
          });
          if (!response.ok) {
            throw new Error(response.error);
          }
        })
      );
      const nextState = createAgentFilesState();
      for (const name of AGENT_FILE_NAMES) {
        nextState[name] = {
          content: agentFiles[name].content,
          exists: true,
        };
      }
      setAgentFiles(nextState);
      setAgentFilesDirty(false);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save agent files.";
      setAgentFilesError(message);
      return false;
    } finally {
      setAgentFilesSaving(false);
    }
  }, [agentFiles, sessionKey]);

  const handleAgentFileTabChange = useCallback(
    async (nextTab: AgentFileName) => {
      if (nextTab === agentFileTab) return;
      if (agentFilesDirty && !agentFilesSaving) {
        const saved = await saveAgentFiles();
        if (!saved) return;
      }
      setAgentFileTab(nextTab);
    },
    [agentFileTab, agentFilesDirty, agentFilesSaving, saveAgentFiles]
  );

  const setAgentFileContent = useCallback(
    (value: string) => {
      setAgentFiles((prev) => ({
        ...prev,
        [agentFileTab]: { ...prev[agentFileTab], content: value },
      }));
      setAgentFilesDirty(true);
    },
    [agentFileTab]
  );

  useEffect(() => {
    void loadAgentFiles();
  }, [loadAgentFiles]);

  useEffect(() => {
    if (!AGENT_FILE_NAMES.includes(agentFileTab)) {
      setAgentFileTab(AGENT_FILE_NAMES[0]);
    }
  }, [agentFileTab]);

  return {
    agentFiles,
    agentFileTab,
    agentFilesLoading,
    agentFilesSaving,
    agentFilesDirty,
    agentFilesError,
    setAgentFileContent,
    handleAgentFileTabChange,
    saveAgentFiles,
  };
};
