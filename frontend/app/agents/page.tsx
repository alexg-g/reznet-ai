'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AgentTemplate } from '@/types/agentTemplate';
import { agentTemplatesAPI } from '@/lib/api/agentTemplates';
import AgentTemplateModal from '@/components/AgentTemplateModal';
import { useChatStore } from '@/store/chatStore';

export default function AgentsPage() {
  const router = useRouter();
  const { setAgents } = useChatStore();
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);
  const [filteredTemplates, setFilteredTemplates] = useState<AgentTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [domainFilter, setDomainFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<AgentTemplate | null>(null);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const domains = ['All', 'Software Development', 'Marketing', 'Legal', 'Research', 'Content Creation', 'Business Operations', 'Data Science', 'Design'];

  useEffect(() => {
    fetchTemplates();
  }, []);

  useEffect(() => {
    filterTemplates();
  }, [templates, searchQuery, domainFilter, typeFilter]);

  const fetchTemplates = async () => {
    try {
      setIsLoading(true);
      const data = await agentTemplatesAPI.list();
      // Ensure data is an array
      if (Array.isArray(data)) {
        setTemplates(data);
      } else {
        console.error('API returned non-array data:', data);
        setTemplates([]);
        showToast('Failed to load templates: Invalid data format', 'error');
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setTemplates([]); // Ensure templates is always an array
      showToast('Failed to load templates', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const filterTemplates = () => {
    let filtered = templates;

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (t) =>
          t.display_name.toLowerCase().includes(query) ||
          t.role.toLowerCase().includes(query) ||
          t.name.toLowerCase().includes(query)
      );
    }

    // Domain filter
    if (domainFilter !== 'All') {
      filtered = filtered.filter((t) => t.domain === domainFilter);
    }

    // Type filter
    if (typeFilter !== 'All') {
      filtered = filtered.filter((t) => t.template_type === typeFilter.toLowerCase());
    }

    setFilteredTemplates(filtered);
  };

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const handleCreateTemplate = async (data: any) => {
    try {
      await agentTemplatesAPI.create(data);
      showToast(`Template '${data.display_name}' created successfully!`, 'success');
      fetchTemplates();
      setIsModalOpen(false);
    } catch (error) {
      throw error;
    }
  };

  const handleUpdateTemplate = async (data: any) => {
    if (!editingTemplate) return;
    try {
      await agentTemplatesAPI.update(editingTemplate.id, data);
      showToast(`Template '${data.display_name}' updated successfully!`, 'success');
      fetchTemplates();
      setIsModalOpen(false);
      setEditingTemplate(null);
    } catch (error) {
      throw error;
    }
  };

  const handleDeleteTemplate = async (template: AgentTemplate) => {
    if (template.template_type === 'default') {
      showToast('Cannot delete default templates', 'error');
      return;
    }

    if (!confirm(`Are you sure you want to delete "${template.display_name}"?`)) {
      return;
    }

    try {
      await agentTemplatesAPI.delete(template.id);
      showToast('Template deleted', 'success');
      fetchTemplates();
    } catch (error) {
      console.error('Failed to delete template:', error);
      showToast(error instanceof Error ? error.message : 'Failed to delete template', 'error');
    }
  };

  const handleInstantiateTemplate = async (template: AgentTemplate) => {
    try {
      const agent = await agentTemplatesAPI.instantiate(template.id);
      showToast(
        `Agent @${template.name} created! You can now use it in channels.`,
        'success'
      );

      // Refresh agents list
      const response = await fetch('http://localhost:8000/api/agents');
      const agents = await response.json();
      setAgents(agents);

      // Navigate to unified chat interface with DM view
      router.push(`/?view=dm&id=${agent.id}`);
    } catch (error) {
      console.error('Failed to instantiate template:', error);
      showToast(
        error instanceof Error ? error.message : 'Failed to create agent',
        'error'
      );
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'default':
        return 'bg-electric-purple/20 text-electric-purple border-electric-purple/30';
      case 'custom':
        return 'bg-neon-cyan/20 text-neon-cyan border-neon-cyan/30';
      case 'community':
        return 'bg-lime-green/20 text-lime-green border-lime-green/30';
      default:
        return 'bg-gray-500/20 text-gray-300 border-gray-500/30';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-deep-dark">
        <div className="text-neon-cyan text-xl animate-pulse">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-deep-dark grid-bg-subtle">
      {/* Header */}
      <header className="border-b border-electric-purple/30 bg-deep-dark/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/')}
                  className="text-neon-cyan hover:text-white transition-colors duration-200"
                  aria-label="Back to chat"
                >
                  <span className="material-symbols-outlined text-3xl">arrow_back</span>
                </button>
                <h1 className="text-3xl font-bold text-white">Agent Templates</h1>
              </div>
              <p className="text-gray-400 mt-2">
                Create custom AI agents or use pre-built templates for common tasks
              </p>
            </div>
            <button
              onClick={() => {
                setEditingTemplate(null);
                setIsModalOpen(true);
              }}
              className="px-6 py-3 bg-neon-cyan hover:bg-white text-black rounded-lg font-bold shadow-glow-cyan transition-all duration-200 flex items-center gap-2"
            >
              <span className="material-symbols-outlined">add</span>
              Create New Template
            </button>
          </div>

          {/* Filters */}
          <div className="mt-6 flex flex-wrap gap-4">
            {/* Search */}
            <div className="flex-1 min-w-[300px]">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search templates..."
                className="w-full bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
              />
            </div>

            {/* Domain Filter */}
            <select
              value={domainFilter}
              onChange={(e) => setDomainFilter(e.target.value)}
              className="bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
            >
              {domains.map((domain) => (
                <option key={domain} value={domain}>
                  {domain === 'All' ? 'All Domains' : domain}
                </option>
              ))}
            </select>

            {/* Type Filter */}
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-black/50 border border-electric-purple/50 rounded-lg px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-neon-cyan focus:border-transparent"
            >
              <option value="All">All Types</option>
              <option value="default">Default</option>
              <option value="custom">Custom</option>
              <option value="community">Community</option>
            </select>
          </div>
        </div>
      </header>

      {/* Templates Grid */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {!Array.isArray(filteredTemplates) || filteredTemplates.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">
              {searchQuery || domainFilter !== 'All' || typeFilter !== 'All'
                ? 'No templates match your filters'
                : 'No templates available'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTemplates.map((template) => (
              <div
                key={template.id}
                className="bg-gray-900 border border-electric-purple/30 hover:border-electric-purple rounded-lg transition-all duration-200 hover:shadow-lg hover:shadow-electric-purple/20 flex flex-col"
              >
                {/* Card Header */}
                <div className="p-6 flex-1">
                  <div className="flex items-start gap-4">
                    <div
                      className="text-4xl flex-shrink-0"
                      style={{ filter: `drop-shadow(0 0 8px ${template.color || '#00F6FF'})` }}
                    >
                      {template.icon || '🤖'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-white truncate">
                        {template.display_name}
                      </h3>
                      <p className="text-gray-400 text-sm mt-1 line-clamp-2">{template.role}</p>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span
                          className={`text-xs px-2 py-1 rounded border ${getTypeColor(
                            template.template_type
                          )}`}
                        >
                          {template.template_type}
                        </span>
                        {template.domain && (
                          <span className="text-xs px-2 py-1 rounded bg-gray-700/50 text-gray-300 border border-gray-600/30">
                            {template.domain}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expandable Details */}
                  {expandedTemplate === template.id && (
                    <div className="mt-4 pt-4 border-t border-electric-purple/30">
                      <h4 className="text-sm font-bold text-electric-purple mb-2">System Prompt:</h4>
                      <div className="bg-black/50 rounded p-3 max-h-48 overflow-y-auto glowing-scrollbar">
                        <p className="text-gray-300 text-sm whitespace-pre-wrap">
                          {template.system_prompt}
                        </p>
                      </div>
                      {template.available_tools.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-bold text-electric-purple mb-2">Tools:</h4>
                          <div className="flex flex-wrap gap-2">
                            {template.available_tools.map((tool) => (
                              <span
                                key={tool}
                                className="text-xs px-2 py-1 rounded bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30"
                              >
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="mt-3">
                        <h4 className="text-sm font-bold text-electric-purple mb-2">LLM Config:</h4>
                        <p className="text-gray-300 text-sm">
                          Provider: {template.llm_config.provider || 'default'}
                          {template.llm_config.model && `, Model: ${template.llm_config.model}`}
                          {template.llm_config.temperature !== undefined &&
                            `, Temp: ${template.llm_config.temperature}`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Actions */}
                <div className="p-4 border-t border-electric-purple/30 flex flex-wrap gap-2">
                  <button
                    onClick={() =>
                      setExpandedTemplate(expandedTemplate === template.id ? null : template.id)
                    }
                    className="flex-1 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded transition-colors duration-200 text-sm"
                  >
                    {expandedTemplate === template.id ? 'Hide Details' : 'View Details'}
                  </button>
                  <button
                    onClick={() => handleInstantiateTemplate(template)}
                    className="flex-1 px-3 py-2 bg-neon-cyan hover:bg-white text-black rounded font-bold transition-colors duration-200 text-sm"
                  >
                    Use Template
                  </button>
                  {template.template_type === 'custom' && (
                    <>
                      <button
                        onClick={() => {
                          setEditingTemplate(template);
                          setIsModalOpen(true);
                        }}
                        className="px-3 py-2 bg-electric-purple/20 hover:bg-electric-purple/30 text-electric-purple rounded transition-colors duration-200 text-sm"
                        aria-label="Edit template"
                      >
                        <span className="material-symbols-outlined text-sm">edit</span>
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template)}
                        className="px-3 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded transition-colors duration-200 text-sm"
                        aria-label="Delete template"
                      >
                        <span className="material-symbols-outlined text-sm">delete</span>
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      <AgentTemplateModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingTemplate(null);
        }}
        onSave={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
        template={editingTemplate}
        mode={editingTemplate ? 'edit' : 'create'}
      />

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-slide-in">
          <div
            className={`px-6 py-4 rounded-lg shadow-lg ${
              toast.type === 'success'
                ? 'bg-lime-green/20 border border-lime-green text-lime-green'
                : 'bg-red-500/20 border border-red-500 text-red-500'
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined">
                {toast.type === 'success' ? 'check_circle' : 'error'}
              </span>
              <p className="font-medium">{toast.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
