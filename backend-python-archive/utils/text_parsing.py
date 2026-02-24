"""
Text parsing utilities for RezNet AI
Handles markdown stripping and @mention extraction
"""

import re
from typing import List, Tuple


def strip_markdown(text: str) -> str:
    """
    Strip all markdown formatting from text while preserving content.

    Handles:
    - Bold: **text**, __text__
    - Italic: *text*, _text_ (but preserves @mentions)
    - Code blocks: `code`, ```code```
    - Links: [text](url) → text
    - Images: ![alt](url) → alt
    - Headers: # Header
    - Lists: -, *, 1.
    - Blockquotes: > text
    - Strikethrough: ~~text~~
    - Horizontal rules: ---, ***

    Args:
        text: The markdown-formatted text

    Returns:
        Plain text with markdown syntax removed

    Examples:
        >>> strip_markdown("**Bold** and *italic*")
        'Bold and italic'
        >>> strip_markdown("Check with @backend for **details**")
        'Check with @backend for details'
        >>> strip_markdown("`code block` and normal text")
        'code block and normal text'
    """
    if not text:
        return text

    # Remove code blocks (```code```) - do this first to avoid processing code as markdown
    text = re.sub(r'```[\s\S]*?```', lambda m: m.group(0).replace('```', ''), text)

    # Remove inline code (`code`)
    text = re.sub(r'`([^`]+)`', r'\1', text)

    # Remove images: ![alt](url) → alt
    text = re.sub(r'!\[([^\]]*)\]\([^\)]+\)', r'\1', text)

    # Remove links: [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^\)]+\)', r'\1', text)

    # Remove bold: **text** or __text__
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'__(.+?)__', r'\1', text)

    # Remove strikethrough: ~~text~~
    text = re.sub(r'~~(.+?)~~', r'\1', text)

    # Remove italic: *text* or _text_ (but preserve @mentions)
    # Use negative lookbehind to avoid matching @mentions
    text = re.sub(r'(?<!@)\*(?!\*)(.+?)\*', r'\1', text)
    text = re.sub(r'(?<!@)_(?!_)(.+?)_', r'\1', text)

    # Remove headers: # Header, ## Header, etc.
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)

    # Remove blockquotes: > text
    text = re.sub(r'^>\s*', '', text, flags=re.MULTILINE)

    # Remove horizontal rules: ---, ***, ___
    text = re.sub(r'^[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)

    # Remove list markers: -, *, 1., 2., etc.
    text = re.sub(r'^\s*[-*+]\s+', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)

    # Clean up multiple newlines
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


def extract_mentions(text: str, strip_md: bool = True) -> List[Tuple[str, str]]:
    """
    Extract all @agent mentions from text.

    Args:
        text: Text to search for @mentions
        strip_md: Whether to strip markdown before extracting (default: True)

    Returns:
        List of tuples: [(mention_with_@, mention_without_@), ...]
        Example: [('@backend', 'backend'), ('@frontend', 'frontend')]

    Examples:
        >>> extract_mentions("Ask @backend and @frontend")
        [('@backend', 'backend'), ('@frontend', 'frontend')]
        >>> extract_mentions("**@backend** can help")
        [('@backend', 'backend')]
        >>> extract_mentions("Email test@example.com and ask @qa")
        [('@qa', 'qa')]
    """
    if not text:
        return []

    # Strip markdown if requested
    if strip_md:
        text = strip_markdown(text)

    # Pattern to match @mentions
    # Must be:
    # - Start with @
    # - Followed by one or more word characters (letters, numbers, underscore)
    # - Not part of an email address (not preceded by alphanumeric or followed by .)
    # - Common agent names: backend, frontend, qa, devops, orchestrator

    # Use word boundary before @ to avoid matching emails
    pattern = r'(?<![a-zA-Z0-9])@(\w+)(?![.])'

    matches = re.findall(pattern, text)

    # Return list of tuples: (with @, without @)
    # Filter out common non-agent mentions like email addresses
    valid_mentions = []
    for match in matches:
        # Only include if it looks like an agent name (all lowercase or known agents)
        if match.lower() in ['backend', 'frontend', 'qa', 'devops', 'orchestrator'] or match.islower():
            valid_mentions.append((f'@{match}', match))

    # Remove duplicates while preserving order
    seen = set()
    result = []
    for mention in valid_mentions:
        if mention[1] not in seen:
            seen.add(mention[1])
            result.append(mention)

    return result


def extract_agent_names_from_task_line(line: str) -> List[str]:
    """
    Extract agent names from a workflow task line.

    Expected format: "Task N: @agent - description"

    Args:
        line: A single task line from workflow plan

    Returns:
        List of agent names (without @)

    Examples:
        >>> extract_agent_names_from_task_line("Task 1: @backend - Create API")
        ['backend']
        >>> extract_agent_names_from_task_line("**Task 2**: @frontend - Build UI")
        ['frontend']
    """
    # Strip markdown first
    clean_line = strip_markdown(line)

    # Look for pattern: Task N: @agent
    pattern = r'Task\s+\d+:\s*@(\w+)'
    match = re.search(pattern, clean_line, re.IGNORECASE)

    if match:
        return [match.group(1).lower()]

    return []


def is_task_complete_signal(text: str) -> bool:
    """
    Check if text contains a task completion signal.

    Looks for phrases like:
    - "TASK COMPLETE"
    - "Task completed"
    - "Work finished"

    Args:
        text: Agent response text

    Returns:
        True if text contains completion signal

    Examples:
        >>> is_task_complete_signal("All done! TASK COMPLETE")
        True
        >>> is_task_complete_signal("Still working on it...")
        False
    """
    if not text:
        return False

    # Convert to lowercase for case-insensitive matching
    text_lower = text.lower()

    # Completion patterns
    patterns = [
        r'\btask\s+complete\b',
        r'\btask\s+completed\b',
        r'\bwork\s+complete\b',
        r'\bwork\s+finished\b',
        r'\bfinished\s+task\b',
        r'\bdone\s+with\s+task\b',
        r'\btask\s+is\s+done\b',
    ]

    for pattern in patterns:
        if re.search(pattern, text_lower):
            return True

    return False
