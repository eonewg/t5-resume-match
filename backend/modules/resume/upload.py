"""Bounded, in-memory file-to-text adaptation; no parsing or persistence rules."""

import os
from io import BytesIO
from pathlib import PurePath
from zipfile import ZipFile

from defusedxml.ElementTree import fromstring
from pypdf import PdfReader, apply_configuration

PDF_NO_TEXT = (
    "未能从该 PDF 提取有效文字。扫描版简历暂不支持，请上传可复制文字的 PDF，或直接粘贴简历文本。"
)
MIMES = {
    ".txt": {"text/plain"},
    ".pdf": {"application/pdf"},
    ".docx": {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"},
}
MAX_EXPANDED_BYTES = 30 * 1024 * 1024
W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


class UploadError(ValueError):
    def __init__(self, message: str, status_code: int = 422):
        super().__init__(message)
        self.status_code = status_code


def upload_limit() -> int:
    """Deployment override in bytes; fail closed for an invalid configuration."""
    try:
        limit = int(os.environ.get("T5_RESUME_UPLOAD_MAX_BYTES", 10 * 1024 * 1024))
        if limit > 0:
            return limit
    except ValueError:
        pass
    raise UploadError("简历上传暂不可用，请稍后重试。", 503)


def validate_file_type(filename: str | None, content_type: str | None) -> str:
    # The supplied name is never opened, joined to a directory or reflected in errors.
    suffix = PurePath(filename or "").suffix.lower()
    mime = (content_type or "").split(";", 1)[0].strip().lower()
    if suffix not in MIMES or mime not in MIMES[suffix]:
        raise UploadError("文件格式不支持，请上传 PDF、DOCX 或 UTF-8 TXT 简历。", 415)
    return suffix


def _docx_text(data: bytes) -> str:
    with ZipFile(BytesIO(data)) as archive:
        entries = archive.infolist()
        if (
            len(entries) > 2000
            or len({entry.filename for entry in entries}) != len(entries)
            or sum(entry.file_size for entry in entries) > MAX_EXPANDED_BYTES
            or any(entry.flag_bits & 1 for entry in entries)
        ):
            raise UploadError("DOCX 文件内容过大或不受支持，请改为粘贴简历文本。")
        if any("vbaproject" in entry.filename.lower() for entry in entries):
            raise UploadError("不支持包含宏的文档，请上传普通 DOCX 简历。")
        # Only this XML member is read; relationships/embeddings are never followed.
        document = archive.read("word/document.xml")
    root = fromstring(document)
    if root.tag != W + "document":
        raise UploadError("DOCX 文件无法读取，请检查文件或直接粘贴简历文本。")
    lines = []
    # Table cells contain paragraphs too, so preserve their document order.
    for paragraph in root.iter(W + "p"):
        fragments = []
        for element in paragraph.iter():
            if element.tag == W + "t":
                fragments.append(element.text or "")
            elif element.tag == W + "tab":
                fragments.append("\t")
            elif element.tag in {W + "br", W + "cr"}:
                fragments.append("\n")
        lines.append("".join(fragments))
    return "\n".join(lines)


def _pdf_text(data: bytes) -> str:
    if not data.startswith(b"%PDF-"):
        raise UploadError("PDF 文件无法读取，请检查文件或直接粘贴简历文本。")
    reader = PdfReader(BytesIO(data), strict=True)
    if reader.is_encrypted:
        raise UploadError("暂不支持加密 PDF，请解除密码保护后上传，或直接粘贴简历文本。")
    if len(reader.pages) > 100:
        raise UploadError("PDF 页数过多，请上传不超过 100 页的简历。")
    pages = []
    total = 0
    decoded_bytes = 0
    for page in reader.pages:
        contents = page.get_contents()
        if contents is not None:
            decoded_bytes += len(contents.get_data())
            if decoded_bytes > MAX_EXPANDED_BYTES:
                raise UploadError("PDF 内容过大，请改为粘贴简历文本。")
        text = page.extract_text() or ""
        total += len(text)
        if total > MAX_EXPANDED_BYTES:
            raise UploadError("PDF 文字内容过大，请改为粘贴简历文本。")
        pages.append(text)
    text = "\n".join(pages)
    if sum(character.isalnum() for character in text) < 10:
        raise UploadError(PDF_NO_TEXT)
    return text


def extract_text(data: bytes, suffix: str) -> str:
    if not data:
        raise UploadError("文件为空，请选择包含简历内容的文件。")
    try:
        if suffix == ".txt":
            text = data.decode("utf-8-sig")
            if "\x00" in text:
                raise UploadError("TXT 文件不是有效文字，请使用 UTF-8 编码保存后重试。")
        elif suffix == ".docx":
            text = _docx_text(data)
        elif suffix == ".pdf":
            # Context-local limits also apply before parsing compressed object/content streams.
            with apply_configuration(
                maximum_declared_stream_length=MAX_EXPANDED_BYTES,
                array_based_stream_maximum_output_length=MAX_EXPANDED_BYTES,
                zlib_maximum_output_length=MAX_EXPANDED_BYTES,
                lzw_maximum_output_length=MAX_EXPANDED_BYTES,
                run_length_maximum_output_length=MAX_EXPANDED_BYTES,
                jbig2_maximum_output_length=MAX_EXPANDED_BYTES,
                disable_legacy_handling=True,
            ):
                text = _pdf_text(data)
        else:
            raise UploadError("文件格式不支持。", 415)
    except UploadError:
        raise
    except UnicodeDecodeError:
        raise UploadError("TXT 文件无法解码，请使用 UTF-8 编码保存后重试。") from None
    except Exception:
        # Parser exceptions may contain document content or implementation details.
        raise UploadError("文件损坏或无法读取，请检查文件或直接粘贴简历文本。") from None
    if not text.strip():
        raise UploadError("文件没有可读取的文字，请检查文件或直接粘贴简历文本。")
    if len(text) > 50000:
        raise UploadError("提取的简历文字超过 50000 字，请精简内容后重试。")
    return text
