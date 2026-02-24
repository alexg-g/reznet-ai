"""
Tool Schema Definitions for LLM Function Calling

Defines tool/function schemas for Claude (Anthropic) and OpenAI APIs
"""

from typing import Dict, Any, List


# ============================================
# Anthropic Claude Tool Schemas
# ============================================

ANTHROPIC_FILESYSTEM_TOOLS: List[Dict[str, Any]] = [
    {
        "name": "read_file",
        "description": "Read the contents of a file from the workspace. Use this to view existing code, configuration files, or any text-based files. All paths are relative to the workspace root.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file relative to workspace root (e.g., 'backend/api/users.py')"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "write_file",
        "description": "Write content to a file in the workspace. Creates the file if it doesn't exist, and creates parent directories as needed. Use this to create new files or update existing ones.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file relative to workspace root (e.g., 'backend/api/users.py')"
                },
                "content": {
                    "type": "string",
                    "description": "Complete content to write to the file"
                }
            },
            "required": ["path", "content"]
        }
    },
    {
        "name": "list_directory",
        "description": "List the contents of a directory in the workspace. Returns information about files and subdirectories including names, types, sizes, and modification times.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the directory relative to workspace root (e.g., 'backend/api'). Leave empty for workspace root."
                }
            },
            "required": []
        }
    },
    {
        "name": "create_directory",
        "description": "Create a new directory in the workspace. Creates parent directories automatically if they don't exist.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the directory to create relative to workspace root (e.g., 'backend/api/v2')"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "delete_file",
        "description": "Delete a file from the workspace. Use with caution as this operation cannot be undone.",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to the file to delete relative to workspace root (e.g., 'backend/api/old_endpoint.py')"
                }
            },
            "required": ["path"]
        }
    },
    {
        "name": "file_exists",
        "description": "Check if a file or directory exists in the workspace. Returns whether it exists and its type (file or directory).",
        "input_schema": {
            "type": "object",
            "properties": {
                "path": {
                    "type": "string",
                    "description": "Path to check relative to workspace root (e.g., 'backend/api/users.py')"
                }
            },
            "required": ["path"]
        }
    }
]


# ============================================
# OpenAI Function Schemas
# ============================================

OPENAI_FILESYSTEM_TOOLS: List[Dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "read_file",
            "description": "Read the contents of a file from the workspace. Use this to view existing code, configuration files, or any text-based files. All paths are relative to the workspace root.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file relative to workspace root (e.g., 'backend/api/users.py')"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "write_file",
            "description": "Write content to a file in the workspace. Creates the file if it doesn't exist, and creates parent directories as needed. Use this to create new files or update existing ones.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file relative to workspace root (e.g., 'backend/api/users.py')"
                    },
                    "content": {
                        "type": "string",
                        "description": "Complete content to write to the file"
                    }
                },
                "required": ["path", "content"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "list_directory",
            "description": "List the contents of a directory in the workspace. Returns information about files and subdirectories including names, types, sizes, and modification times.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the directory relative to workspace root (e.g., 'backend/api'). Leave empty for workspace root."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_directory",
            "description": "Create a new directory in the workspace. Creates parent directories automatically if they don't exist.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the directory to create relative to workspace root (e.g., 'backend/api/v2')"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "delete_file",
            "description": "Delete a file from the workspace. Use with caution as this operation cannot be undone.",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to the file to delete relative to workspace root (e.g., 'backend/api/old_endpoint.py')"
                    }
                },
                "required": ["path"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "file_exists",
            "description": "Check if a file or directory exists in the workspace. Returns whether it exists and its type (file or directory).",
            "parameters": {
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "Path to check relative to workspace root (e.g., 'backend/api/users.py')"
                    }
                },
                "required": ["path"]
            }
        }
    }
]


# ============================================
# XML-Based Tool Instructions for Ollama
# ============================================

OLLAMA_TOOL_INSTRUCTIONS = """
## IMPORTANT: File Operations

You have access to filesystem operations. When you need to create or read files, you MUST use XML tool calls.

### XML Format Rules:
- ALWAYS include the parameter tags (<path>, <content>, etc.)
- NEVER leave tags empty
- Put actual values inside the tags
- Use exact format shown in examples

### Available Tools:

1. **read_file** - Read a file's contents
   CORRECT format:
   ```xml
   <tool_call name="read_file">
     <path>backend/api/users.py</path>
   </tool_call>
   ```

2. **write_file** - Create or update a file
   CORRECT format:
   ```xml
   <tool_call name="write_file">
     <path>backend/api/users.py</path>
     <content>from fastapi import APIRouter

router = APIRouter()

@router.get("/users")
async def list_users():
    return {"users": []}
</content>
   </tool_call>
   ```

   WRONG (do NOT do this):
   ```xml
   <tool_call name="write_file">

   </tool_call>
   ```

3. **list_directory** - List directory contents
   CORRECT format:
   ```xml
   <tool_call name="list_directory">
     <path>backend/api</path>
   </tool_call>
   ```

4. **create_directory** - Create a new directory
   CORRECT format:
   ```xml
   <tool_call name="create_directory">
     <path>backend/api/v2</path>
   </tool_call>
   ```

5. **file_exists** - Check if a file exists
   CORRECT format:
   ```xml
   <tool_call name="file_exists">
     <path>backend/api/users.py</path>
   </tool_call>
   ```

### Critical Requirements:
- All paths are relative to the workspace root (e.g., "backend/api/users.py")
- ALWAYS include <path> and <content> tags with actual values
- Do NOT leave tags empty
- Write the COMPLETE file content inside <content> tags
- File operations are sandboxed to the workspace directory
- Tool results will be confirmed after execution

### Complete Example:
User: "Create a FastAPI users endpoint"

Your response should be:
"I'll create the users API endpoint file now.

<tool_call name="write_file">
  <path>backend/api/users.py</path>
  <content>from fastapi import APIRouter

router = APIRouter()

@router.get("/users")
async def list_users():
    return {"users": []}
</content>
</tool_call>

I've created the users API endpoint file with a basic list_users function that returns an empty list."
"""


# ============================================
# Helper Functions
# ============================================

def get_tool_schemas(provider: str) -> List[Dict[str, Any]]:
    """
    Get appropriate tool schemas for the given LLM provider

    Args:
        provider: LLM provider name ('anthropic', 'openai', or 'ollama')

    Returns:
        List of tool schemas in the appropriate format
    """
    if provider == "anthropic":
        return ANTHROPIC_FILESYSTEM_TOOLS
    elif provider == "openai":
        return OPENAI_FILESYSTEM_TOOLS
    else:
        # Ollama doesn't use structured schemas, returns empty list
        return []


def get_tool_instructions(provider: str) -> str:
    """
    Get tool usage instructions for the given LLM provider

    Args:
        provider: LLM provider name ('anthropic', 'openai', or 'ollama')

    Returns:
        Tool usage instructions to add to system prompt
    """
    if provider in ["anthropic", "openai"]:
        # These providers use native tool calling, minimal instruction needed
        return """
You have access to filesystem tools for reading and writing files in the workspace.
Use these tools when you need to view existing files, create new files, or modify code.
All file paths are relative to the workspace root directory.
"""
    else:
        # Ollama and other providers need detailed XML instructions
        return OLLAMA_TOOL_INSTRUCTIONS


def has_native_tool_calling(provider: str) -> bool:
    """
    Check if the provider supports native tool/function calling

    Args:
        provider: LLM provider name

    Returns:
        True if provider has native tool calling support
    """
    return provider in ["anthropic", "openai"]
