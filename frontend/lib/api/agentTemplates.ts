import { AgentTemplate, AgentTemplateFormData } from '@/types/agentTemplate';
import { API_URL } from '@/lib/constants';

export const agentTemplatesAPI = {
  list: async (params?: { domain?: string; template_type?: string }): Promise<AgentTemplate[]> => {
    const query = new URLSearchParams(params as any);
    const url = `${API_URL}/api/agent-templates${query.toString() ? `?${query}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch templates: ${res.statusText}`);
    }
    const data = await res.json();
    // Backend returns {templates: [], total: N, ...} but we just need the templates array
    return data.templates || [];
  },

  get: async (id: string): Promise<AgentTemplate> => {
    const res = await fetch(`${API_URL}/api/agent-templates/${id}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch template: ${res.statusText}`);
    }
    return res.json();
  },

  create: async (data: AgentTemplateFormData): Promise<AgentTemplate> => {
    const res = await fetch(`${API_URL}/api/agent-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to create template');
    }
    return res.json();
  },

  update: async (id: string, data: Partial<AgentTemplateFormData>): Promise<AgentTemplate> => {
    const res = await fetch(`${API_URL}/api/agent-templates/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to update template');
    }
    return res.json();
  },

  delete: async (id: string): Promise<void> => {
    const res = await fetch(`${API_URL}/api/agent-templates/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to delete template');
    }
  },

  instantiate: async (id: string): Promise<any> => {
    const res = await fetch(`${API_URL}/api/agent-templates/${id}/instantiate`, {
      method: 'POST',
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.detail || 'Failed to instantiate template');
    }
    return res.json();
  },
};
