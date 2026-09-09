"""File adapter acceptance: text fidelity, safe rejection, and draft isolation."""

from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

from backend.core.config import Settings
from backend.main import create_app
from backend.modules.resume.upload import PDF_NO_TEXT

DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
RAW = "  姓名：测试同学\r\n技能：Python、SQL\r\n项目经历：课程数据整理。\n "


@pytest.fixture
def client(tmp_path):
    app = create_app(Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'upload.db'}"))
    with TestClient(app) as client:
        yield client


def upload(client, data, name="resume.txt", mime="text/plain"):
    return client.post("/api/v1/resumes/upload-preview", files={"file": (name, data, mime)})


def docx(xml=None, extras=None):
    if xml is None:
        xml = (
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>姓名：测试同学</w:t></w:r></w:p>"
            "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>技能：Python、SQL</w:t></w:r></w:p>"
            "</w:tc></w:tr></w:tbl></w:body></w:document>"
        )
    output = BytesIO()
    with ZipFile(output, "w", ZIP_DEFLATED) as archive:
        archive.writestr("word/document.xml", xml)
        for name, data in (extras or {}).items():
            archive.writestr(name, data)
    return output.getvalue()


def pdf(text=None, encrypted=False):
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    if text is not None:
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
            }
        )
        page[NameObject("/Resources")] = DictionaryObject(
            {NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})}
        )
        stream = DecodedStreamObject()
        stream.set_data(f"BT /F1 12 Tf 72 720 Td ({text}) Tj ET".encode("ascii"))
        page[NameObject("/Contents")] = stream
    if encrypted:
        writer.encrypt("private")
    output = BytesIO()
    writer.write(output)
    return output.getvalue()


@pytest.mark.parametrize("bom", [b"", b"\xef\xbb\xbf"])
def test_txt_preserves_raw_and_reuses_parser(client, bom):
    response = upload(client, bom + RAW.encode("utf-8"))
    assert response.status_code == 200
    assert response.headers["x-t5-mock"] == "false"
    assert response.json() == client.post("/api/v1/resumes/preview", json={"raw_text": RAW}).json()
    assert response.json()["raw_text"] == RAW
    assert client.get("/api/v1/resumes").json() == []


def test_docx_paragraphs_and_tables(client):
    response = upload(client, docx(), "resume.docx", DOCX_MIME)
    assert response.status_code == 200
    assert response.json()["raw_text"] == "姓名：测试同学\n技能：Python、SQL"
    assert response.json()["skills"] == ["Python", "SQL"]


def test_text_pdf(client):
    response = upload(client, pdf("Name: Alex Example"), "resume.pdf", "application/pdf")
    assert response.status_code == 200
    assert response.json()["raw_text"] == "Name: Alex Example"
    assert response.json()["name"] == "Alex Example"


@pytest.mark.parametrize("text", [None, " . "])
def test_no_text_pdf_exact_guidance(client, text):
    response = upload(client, pdf(text), "resume.pdf", "application/pdf")
    assert response.status_code == 422
    assert PDF_NO_TEXT in response.text


@pytest.mark.parametrize(
    "data,name,mime,status",
    [
        (b"", "resume.txt", "text/plain", 422),
        (b"  \r\n", "resume.txt", "text/plain", 422),
        (b"bad", "resume.exe", "application/octet-stream", 415),
        (b"bad", "resume.pdf", "text/plain", 415),
        (b"bad", "resume.txt", "application/octet-stream", 415),
        (b"bad", "resume.docx", DOCX_MIME, 422),
        (b"%PDF-broken", "resume.pdf", "application/pdf", 422),
        (b"\xff\xfe", "resume.txt", "text/plain", 422),
        (b"abc\x00def", "resume.txt", "text/plain", 422),
        (b"x" * 50001, "resume.txt", "text/plain", 422),
    ],
    ids=[
        "empty",
        "blank",
        "suffix",
        "mime-mismatch",
        "unknown-mime",
        "bad-docx",
        "bad-pdf",
        "encoding",
        "binary",
        "long-text",
    ],
)
def test_invalid_uploads_do_not_leak_or_persist(client, data, name, mime, status):
    response = upload(client, data, name, mime)
    assert response.status_code == status
    assert "Traceback" not in response.text
    assert name not in response.text
    assert client.get("/api/v1/resumes").json() == []


def test_configurable_size_limit(client, monkeypatch):
    monkeypatch.setenv("T5_RESUME_UPLOAD_MAX_BYTES", "16")
    assert upload(client, b"x" * 17).status_code == 413
    assert upload(client, b"x" * 16).status_code == 200


def test_special_filename_is_only_metadata(client):
    response = upload(client, RAW.encode(), "../../私密 <script>& 简历.TXT")
    assert response.status_code == 200
    assert response.json()["raw_text"] == RAW


def test_existing_confirmed_data_remains_unchanged(client):
    existing = client.post(
        "/api/v1/resumes",
        json={
            "raw_text": "技能：Python",
            "name": "用户已核对",
            "skills": ["SQL"],
            "education": "手动学历",
            "experience": ["手动经历"],
        },
    ).json()
    assert upload(client, RAW.encode()).status_code == 200
    assert client.get("/api/v1/resumes").json() == [existing]
    assert client.get(f"/api/v1/resumes/{existing['id']}").json() == existing


def test_docx_expansion_limit(client, monkeypatch):
    monkeypatch.setattr("backend.modules.resume.upload.MAX_EXPANDED_BYTES", 1000)
    response = upload(client, docx(extras={"word/bomb.bin": b"x" * 1001}), "r.docx", DOCX_MIME)
    assert response.status_code == 422


def test_docx_does_not_expand_entities_or_accept_macros(client):
    xml = '<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///private">]><x>&secret;</x>'
    assert upload(client, docx(xml), "r.docx", DOCX_MIME).status_code == 422
    assert (
        upload(
            client, docx(extras={"word/vbaProject.bin": b"macro"}), "r.docx", DOCX_MIME
        ).status_code
        == 422
    )


def test_encrypted_pdf_has_clear_error(client):
    response = upload(client, pdf(encrypted=True), "resume.pdf", "application/pdf")
    assert response.status_code == 422
    assert "加密 PDF" in response.text


def test_pdf_compressed_content_is_bounded(client, monkeypatch):
    monkeypatch.setattr("backend.modules.resume.upload.MAX_EXPANDED_BYTES", 1000)
    writer = PdfWriter()
    page = writer.add_blank_page(width=612, height=792)
    stream = DecodedStreamObject()
    stream.set_data(b" " * 2000)
    page[NameObject("/Contents")] = stream.flate_encode()
    output = BytesIO()
    writer.write(output)
    response = upload(client, output.getvalue(), "r.pdf", "application/pdf")
    assert response.status_code == 422
    assert "2000" not in response.text


def test_default_ten_mib_limit(client):
    assert upload(client, b"x" * (10 * 1024 * 1024 + 1)).status_code == 413


def test_bad_limit_configuration_returns_safe_error(client, monkeypatch):
    monkeypatch.setenv("T5_RESUME_UPLOAD_MAX_BYTES", "bad")
    assert upload(client, RAW.encode()).status_code == 503
