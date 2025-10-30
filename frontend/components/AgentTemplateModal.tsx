'use client';

import { useState, useEffect } from 'react';
import { AgentTemplate, AgentTemplateFormData } from '@/types/agentTemplate';

interface AgentTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: AgentTemplateFormData) => Promise<void>;
  template?: AgentTemplate | null;
  mode: 'create' | 'edit';
}

const DOMAIN_OPTIONS = [
  'Software Development',
  'Marketing',
  'Legal',
  'Research',
  'Content Creation',
  'Business Operations',
  'Data Science',
  'Design',
  'Custom',
];

const LLM_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic Claude' },
  { value: 'openai', label: 'OpenAI GPT' },
  { value: 'ollama', label: 'Ollama (Local)' },
];

const ANTHROPIC_MODELS = [
  'claude-3-5-sonnet-20241022',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
];

const OPENAI_MODELS = [
  'gpt-4-turbo-preview',
  'gpt-4',
  'gpt-3.5-turbo',
];

const OLLAMA_MODELS = [
  'llama2',
  'mistral',
  'codellama',
];

const AVAILABLE_TOOLS = [
  { id: 'filesystem', label: 'Filesystem Access', description: 'Read/write files in workspace' },
  { id: 'github', label: 'GitHub Integration', description: 'Manage repos, PRs, and issues' },
  { id: 'database', label: 'Database Access', description: 'Query and manage databases (coming soon)', disabled: true },
];

const EXAMPLE_PROMPTS = [
  {
    name: 'Marketing Strategist',
    prompt: `You are a Marketing Strategist AI agent specializing in digital marketing, content strategy, and brand positioning.

Your expertise includes:
- Content marketing and SEO optimization
- Social media strategy and engagement
- Brand messaging and positioning
- Campaign planning and analytics
- Marketing automation and tools

When assisting users:
1. Provide data-driven marketing recommendations
2. Create detailed content calendars and campaign plans
3. Suggest specific tactics with expected outcomes
4. Stay current with digital marketing trends
5. Focus on measurable results and ROI

Always be strategic, creative, and results-oriented.`,
  },
  {
    name: 'Legal Advisor',
    prompt: `You are a Legal Advisor AI agent specializing in contract review, compliance, and legal research.

Your expertise includes:
- Contract analysis and drafting
- Regulatory compliance
- Legal research and precedent analysis
- Risk assessment
- Policy development

When assisting users:
1. Provide clear legal analysis in plain language
2. Highlight potential risks and liabilities
3. Suggest legal best practices
4. Reference relevant laws and regulations
5. Recommend when to consult human legal counsel

Always be thorough, precise, and cautious. Remind users that you provide information, not legal advice.`,
  },
  {
    name: 'Data Analyst',
    prompt: `You are a Data Analyst AI agent specializing in data analysis, visualization, and insights generation.

Your expertise includes:
- Statistical analysis and modeling
- Data visualization and dashboards
- SQL and data querying
- Python/R for data science
- Business intelligence and reporting

When assisting users:
1. Analyze data patterns and trends
2. Create clear, actionable visualizations
3. Provide statistical interpretations
4. Suggest data-driven recommendations
5. Identify data quality issues and gaps

Always be analytical, precise, and insight-focused.`,
  },
];

export default function AgentTemplateModal({
  isOpen,
  onClose,
  onSave,
  template,
  mode,
}: AgentTemplateModalProps) {
  const [formData, setFormData] = useState<AgentTemplateFormData>({
    name: '',
    display_name: '',
    role: '',
    system_prompt: '',
    color: '#00F6FF',
    icon: '🤖',
    domain: 'Software Development',
    llm_config: {
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-20241022',
      temperature: 0.7,
    },
    available_tools: [],
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [customDomain, setCustomDomain] = useState('');

  useEffect(() => {
    if (template && mode === 'edit') {
      setFormData({
        name: template.name,
        display_name: template.display_name,
        role: template.role,
        system_prompt: template.system_prompt,
        color: template.color || '#00F6FF',
        icon: template.icon || '🤖',
        domain: template.domain || 'Software Development',
        llm_config: {
          provider: template.llm_config?.provider || 'anthropic',
          model: template.llm_config?.model || 'claude-3-5-sonnet-20241022',
          temperature: template.llm_config?.temperature || 0.7,
        },
        available_tools: template.available_tools || [],
      });
    }
  }, [template, mode]);

  const generateNameFromDisplay = (displayName: string): string => {
    return displayName
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.display_name.trim()) {
      newErrors.display_name = 'Display name is required';
    } else if (formData.display_name.length > 100) {
      newErrors.display_name = 'Display name must be 100 characters or less';
    }

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (!/^[a-z0-9-]+$/.test(formData.name)) {
      newErrors.name = 'Name must contain only lowercase letters, numbers, and hyphens';
    }

    if (!formData.role.trim()) {
      newErrors.role = 'Role is required';
    } else if (formData.role.length > 200) {
      newErrors.role = 'Role must be 200 characters or less';
    }

    if (!formData.system_prompt.trim()) {
      newErrors.system_prompt = 'System prompt is required';
    } else if (formData.system_prompt.length < 10) {
      newErrors.system_prompt = 'System prompt must be at least 10 characters';
    } else if (formData.system_prompt.length > 10000) {
      newErrors.system_prompt = 'System prompt must be 10,000 characters or less';
    }

    if (formData.color && !/^#[0-9A-F]{6}$/i.test(formData.color)) {
      newErrors.color = 'Color must be a valid hex code (e.g., #00F6FF)';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsSaving(true);
    try {
      await onSave(formData);
      handleClose();
    } catch (error) {
      console.error('Failed to save template:', error);
      setErrors({ submit: error instanceof Error ? error.message : 'Failed to save template' });
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    setFormData({
      name: '',
      display_name: '',
      role: '',
      system_prompt: '',
      color: '#00F6FF',
      icon: '🤖',
      domain: 'Software Development',
      llm_config: {
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        temperature: 0.7,
      },
      available_tools: [],
    });
    setErrors({});
    setShowAdvanced(false);
    setShowPreview(false);
    setCustomDomain('');
    onClose();
  };

  const loadExamplePrompt = (prompt: string) => {
    setFormData({ ...formData, system_prompt: prompt });
  };

  const getModelsForProvider = (provider: string): string[] => {
    switch (provider) {
      case 'anthropic':
        return ANTHROPIC_MODELS;
      case 'openai':
        return OPENAI_MODELS;
      case 'ollama':
        return OLLAMA_MODELS;
      default:
        return ANTHROPIC_MODELS;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-deep-dark border border-electric-purple/50 rounded-lg shadow-glow-purple w-full max-w-4xl max-h-[90vh] overflow-y-auto glowing-scrollbar mx-4">
        {/* Header */}
        <div className="sticky top-0 bg-deep-dark border-b border-electric-purple/30 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">
            {mode === 'create' ? 'Create Agent Template' : 'Edit Agent Template'}
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white transition-colors duration-200"
            aria-label="Close modal"
          >
            <span className="material-symbols-outlined text-3xl">close</span>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Display Name */}
          <div>
            <label htmlFor="display_name" className="block text-sm font-medium text-gray-300 mb-2">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              id="display_name"
              type="text"
              value={formData.display_name}
              onChange={(e) => {
                const displayName = e.target.value;
                setFormData({
                  ...formData,
                  display_name: displayName,
                  name: generateNameFromDisplay(displayName),
                });
              }}
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
              placeholder="Marketing Expert"
              aria-invalid={!!errors.display_name}
              aria-describedby={errors.display_name ? 'display_name-error' : undefined}
            />
            {errors.display_name && (
              <p id="display_name-error" className="text-red-500 text-sm mt-1">
                {errors.display_name}
              </p>
            )}
          </div>

          {/* Name (auto-generated) */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Name (lowercase, hyphenated) <span className="text-red-500">*</span>
            </label>
            <input
              id="name"
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent font-mono"
              placeholder="marketing-expert"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
            />
            {errors.name && (
              <p id="name-error" className="text-red-500 text-sm mt-1">
                {errors.name}
              </p>
            )}
          </div>

          {/* Role */}
          <div>
            <label htmlFor="role" className="block text-sm font-medium text-gray-300 mb-2">
              Role <span className="text-red-500">*</span>
            </label>
            <input
              id="role"
              type="text"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
              placeholder="Content Marketing and SEO Expert"
              maxLength={200}
              aria-invalid={!!errors.role}
              aria-describedby={errors.role ? 'role-error' : undefined}
            />
            <p className="text-gray-500 text-xs mt-1">{formData.role.length}/200 characters</p>
            {errors.role && (
              <p id="role-error" className="text-red-500 text-sm mt-1">
                {errors.role}
              </p>
            )}
          </div>

          {/* Icon and Color */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="icon" className="block text-sm font-medium text-gray-300 mb-2">
                Icon (emoji)
              </label>
              <input
                id="icon"
                type="text"
                value={formData.icon}
                onChange={(e) => setFormData({ ...formData, icon: e.target.value })}
                className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent text-2xl text-center"
                placeholder="🤖"
                maxLength={4}
              />
            </div>
            <div>
              <label htmlFor="color" className="block text-sm font-medium text-gray-300 mb-2">
                Color (hex)
              </label>
              <div className="flex gap-2">
                <input
                  id="color"
                  type="color"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="w-16 h-10 bg-black/50 border border-electric-purple/50 rounded-lg cursor-pointer"
                />
                <input
                  type="text"
                  value={formData.color}
                  onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                  className="flex-1 bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent font-mono"
                  placeholder="#00F6FF"
                />
              </div>
              {errors.color && (
                <p className="text-red-500 text-sm mt-1">{errors.color}</p>
              )}
            </div>
          </div>

          {/* Domain */}
          <div>
            <label htmlFor="domain" className="block text-sm font-medium text-gray-300 mb-2">
              Domain
            </label>
            <select
              id="domain"
              value={formData.domain === customDomain && customDomain ? 'Custom' : formData.domain}
              onChange={(e) => {
                if (e.target.value === 'Custom') {
                  setCustomDomain('');
                  setFormData({ ...formData, domain: '' });
                } else {
                  setCustomDomain('');
                  setFormData({ ...formData, domain: e.target.value });
                }
              }}
              className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
            >
              {DOMAIN_OPTIONS.map((domain) => (
                <option key={domain} value={domain}>
                  {domain}
                </option>
              ))}
            </select>
            {(formData.domain === 'Custom' || customDomain || (!DOMAIN_OPTIONS.includes(formData.domain || '') && formData.domain)) && (
              <input
                type="text"
                value={customDomain || formData.domain}
                onChange={(e) => {
                  setCustomDomain(e.target.value);
                  setFormData({ ...formData, domain: e.target.value });
                }}
                className="mt-2 w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
                placeholder="Enter custom domain"
              />
            )}
          </div>

          {/* System Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="system_prompt" className="block text-sm font-medium text-gray-300">
                System Prompt <span className="text-red-500">*</span>
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs text-neon-cyan hover:text-white transition-colors duration-200"
                >
                  {showPreview ? 'Edit' : 'Preview'}
                </button>
                <select
                  onChange={(e) => {
                    const example = EXAMPLE_PROMPTS.find((p) => p.name === e.target.value);
                    if (example) loadExamplePrompt(example.prompt);
                  }}
                  className="text-xs bg-black/50 border border-electric-purple/50 rounded px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan"
                >
                  <option value="">Load example...</option>
                  {EXAMPLE_PROMPTS.map((example) => (
                    <option key={example.name} value={example.name}>
                      {example.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {showPreview ? (
              <div className="bg-black/50 border border-electric-purple/50 rounded-lg p-4 text-gray-200 whitespace-pre-wrap max-h-96 overflow-y-auto glowing-scrollbar">
                {formData.system_prompt || 'No prompt entered yet...'}
              </div>
            ) : (
              <textarea
                id="system_prompt"
                value={formData.system_prompt}
                onChange={(e) => setFormData({ ...formData, system_prompt: e.target.value })}
                className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent font-mono text-sm"
                placeholder="You are a specialist AI agent..."
                rows={12}
                maxLength={10000}
                aria-invalid={!!errors.system_prompt}
                aria-describedby={errors.system_prompt ? 'system_prompt-error' : undefined}
              />
            )}
            <p className="text-gray-500 text-xs mt-1">
              {formData.system_prompt.length}/10,000 characters
            </p>
            {errors.system_prompt && (
              <p id="system_prompt-error" className="text-red-500 text-sm mt-1">
                {errors.system_prompt}
              </p>
            )}
          </div>

          {/* Available Tools */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Available Tools</label>
            <div className="space-y-2">
              {AVAILABLE_TOOLS.map((tool) => (
                <label
                  key={tool.id}
                  className={`flex items-start gap-3 p-3 rounded-lg border ${
                    tool.disabled
                      ? 'border-gray-700 bg-gray-900/20 cursor-not-allowed opacity-50'
                      : 'border-electric-purple/30 bg-black/30 hover:bg-electric-purple/10 cursor-pointer'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={formData.available_tools?.includes(tool.id)}
                    disabled={tool.disabled}
                    onChange={(e) => {
                      const tools = formData.available_tools || [];
                      if (e.target.checked) {
                        setFormData({ ...formData, available_tools: [...tools, tool.id] });
                      } else {
                        setFormData({
                          ...formData,
                          available_tools: tools.filter((t) => t !== tool.id),
                        });
                      }
                    }}
                    className="mt-1 w-4 h-4 text-neon-cyan bg-black border-electric-purple/50 rounded focus:ring-neon-cyan focus:ring-2"
                  />
                  <div className="flex-1">
                    <p className="text-white font-medium">{tool.label}</p>
                    <p className="text-gray-400 text-sm">{tool.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Advanced Configuration */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-neon-cyan hover:text-white transition-colors duration-200"
            >
              <span className="material-symbols-outlined">
                {showAdvanced ? 'expand_less' : 'expand_more'}
              </span>
              <span className="font-medium">LLM Configuration (Advanced)</span>
            </button>

            {showAdvanced && (
              <div className="mt-4 space-y-4 p-4 bg-black/30 border border-electric-purple/30 rounded-lg">
                {/* Provider */}
                <div>
                  <label htmlFor="provider" className="block text-sm font-medium text-gray-300 mb-2">
                    LLM Provider
                  </label>
                  <select
                    id="provider"
                    value={formData.llm_config?.provider}
                    onChange={(e) => {
                      const provider = e.target.value;
                      const models = getModelsForProvider(provider);
                      setFormData({
                        ...formData,
                        llm_config: {
                          ...formData.llm_config,
                          provider: provider as any,
                          model: models[0],
                        },
                      });
                    }}
                    className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
                  >
                    {LLM_PROVIDERS.map((provider) => (
                      <option key={provider.value} value={provider.value}>
                        {provider.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Model */}
                <div>
                  <label htmlFor="model" className="block text-sm font-medium text-gray-300 mb-2">
                    Model
                  </label>
                  <select
                    id="model"
                    value={formData.llm_config?.model}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        llm_config: { ...formData.llm_config, model: e.target.value },
                      })
                    }
                    className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
                  >
                    {getModelsForProvider(formData.llm_config?.provider || 'anthropic').map(
                      (model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      )
                    )}
                  </select>
                </div>

                {/* Temperature */}
                <div>
                  <label htmlFor="temperature" className="block text-sm font-medium text-gray-300 mb-2">
                    Temperature: {formData.llm_config?.temperature?.toFixed(1)}
                  </label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={formData.llm_config?.temperature}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        llm_config: {
                          ...formData.llm_config,
                          temperature: parseFloat(e.target.value),
                        },
                      })
                    }
                    className="w-full h-2 bg-black/50 rounded-lg appearance-none cursor-pointer accent-neon-cyan"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>More Focused (0.0)</span>
                    <span>More Creative (2.0)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Error Message */}
          {errors.submit && (
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <p className="text-red-500 text-sm">{errors.submit}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-electric-purple/30">
            <button
              type="button"
              onClick={handleClose}
              className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-6 py-2 bg-neon-cyan hover:bg-white text-black rounded-lg font-bold shadow-glow-cyan transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving...' : mode === 'create' ? 'Create Template' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
