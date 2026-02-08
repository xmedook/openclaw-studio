import { useCallback, useEffect, useState } from "react";
import {
  AGENT_FILE_NAMES,
  createAgentFilesState,
  isAgentFileName,
  type AgentFileName,
} from "@/lib/agents/agentFiles";
import { readGatewayAgentFile, writeGatewayAgentFile } from "@/lib/gateway/agentFiles";
import type { GatewayClient } from "@/lib/gateway/GatewayClient";

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

export const useAgentFilesEditor = (params: {
  client: GatewayClient | null | undefined;
  agentId: string | null | undefined;
}): UseAgentFilesEditorResult => {
  const { client, agentId } = params;
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
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        setAgentFiles(createAgentFilesState());
        setAgentFilesDirty(false);
        setAgentFilesError("Agent ID is missing for this agent.");
        return;
      }
      if (!client) {
        setAgentFilesError("Gateway client is not available.");
        return;
      }
      const results = await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          const file = await readGatewayAgentFile({ client, agentId: trimmedAgentId, name });
          return { name, content: file.content, exists: file.exists };
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
  }, [agentId, client]);

  const saveAgentFiles = useCallback(async () => {
    setAgentFilesSaving(true);
    setAgentFilesError(null);
    try {
      const trimmedAgentId = agentId?.trim();
      if (!trimmedAgentId) {
        setAgentFilesError("Agent ID is missing for this agent.");
        return false;
      }
      if (!client) {
        setAgentFilesError("Gateway client is not available.");
        return false;
      }
      await Promise.all(
        AGENT_FILE_NAMES.map(async (name) => {
          await writeGatewayAgentFile({
            client,
            agentId: trimmedAgentId,
            name,
            content: agentFiles[name].content,
          });
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
  }, [agentFiles, agentId, client]);

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
