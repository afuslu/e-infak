"""Safe public-content normalization.

Campaign prose is rendered as plain text in the public client. Normalising it at
the API boundary removes markup from legacy records as well as new submissions.
"""
import re
from html import unescape
from html.parser import HTMLParser


class _TextExtractor(HTMLParser):
    BLOCK_TAGS = {"p", "div", "br", "li", "h1", "h2", "h3", "h4", "blockquote"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.parts: list[str] = []
        self._ignored_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:  # noqa: ARG002
        if tag.lower() in {"script", "style", "iframe", "object", "svg"}:
            self._ignored_depth += 1
            return
        if self._ignored_depth:
            return
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in {"script", "style", "iframe", "object", "svg"}:
            self._ignored_depth = max(self._ignored_depth - 1, 0)
            return
        if self._ignored_depth:
            return
        if tag.lower() in self.BLOCK_TAGS:
            self.parts.append("\n")

    def handle_data(self, data: str) -> None:
        if not self._ignored_depth:
            self.parts.append(data)


def sanitize_public_text(value: str | None) -> str | None:
    if value is None:
        return None
    parser = _TextExtractor()
    parser.feed(value)
    parser.close()
    lines = (unescape(line).strip() for line in "".join(parser.parts).splitlines())
    return "\n".join(line for line in lines if line)[:20_000]


def sanitize_long_text(value: str | None, max_length: int = 60_000) -> str | None:
    """Like sanitize_public_text, but keeps blank lines so paragraphs survive."""
    if value is None:
        return None
    parser = _TextExtractor()
    parser.feed(value.replace("\r\n", "\n"))
    parser.close()
    lines = [unescape(line).rstrip() for line in "".join(parser.parts).split("\n")]
    text = re.sub(r"\n{3,}", "\n\n", "\n".join(lines)).strip()
    return text[:max_length]
