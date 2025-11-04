export interface AgentTemplate {
  id: string;
  name: string;
  display_name: string;
  role: string;
  system_prompt: string;
  color?: string;
  icon?: string;
  available_tools: string[];
  llm_config: {
    provider?: 'anthropic' | 'openai' | 'ollama';
    model?: string;
    temperature?: number;
    max_tokens?: number;
  };
  template_type: 'default' | 'custom' | 'community';
  domain?: string;
  is_public: boolean;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface AgentTemplateFormData {
  name: string;
  display_name: string;
  role: string;
  system_prompt: string;
  color?: string;
  icon?: string;
  domain?: string;
  llm_config?: {
    provider?: string;
    model?: string;
    temperature?: number;
  };
  available_tools?: string[];
}
