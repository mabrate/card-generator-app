"""Small offline XLSX template exporter (literal cells only; no formulas/macros).

Production export uses the Open XML ZIP format and standard library, so classroom
machines do not need Excel, network access, or a workbook-authoring service.
"""
from io import BytesIO
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED


def column(number):
    result = ''
    while number:
        number, remainder = divmod(number - 1, 26)
        result = chr(65 + remainder) + result
    return result


def template_headers(template):
    content = [(field['box'][1], field['key']) for field in template['fields']]
    content.append((template['image_box'][1], 'image_filename'))
    return [key for _, key in sorted(content, key=lambda pair: pair[0])] + ['card_id', 'card_kind', 'copies', 'theme']


def worksheet(rows, widths):
    cols = ''.join(f'<col min="{i}" max="{i}" width="{width}" customWidth="1"/>' for i, width in enumerate(widths, 1))
    contents = []
    for number, row in enumerate(rows, 1):
        cells = ''.join(f'<c r="{column(i)}{number}" s="{1 if number == 1 else 0}" t="inlineStr"><is><t xml:space="preserve">{escape(str(value))}</t></is></c>' for i, value in enumerate(row, 1))
        contents.append(f'<row r="{number}" ht="{30 if number == 1 else 48}" customHeight="1">{cells}</row>')
    return ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
            '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
            f'<cols>{cols}</cols><sheetData>{"".join(contents)}</sheetData></worksheet>')


def export_template(project):
    template = project['template']
    headers = template_headers(template)
    guide = [['Column', 'Box / use', 'Required', 'Character limit', 'Directions'],
             ['WORKFLOW', 'Fill the Cards sheet; save that sheet as UTF-8 CSV.', '', '', 'Import the CSV and matching image files in Teacher → Layout & CSV studio.'],
             ['PROJECT', project['title'], '', '', 'Template version ' + str(project['version'])]]
    for field in template['fields']:
        guide.append([field['key'], field['label'], 'Yes' if field['required'] else 'No', field['max_chars'], field.get('instructions', '')])
    guide.extend([
        ['image_filename', 'Image file, including extension', 'No', '', 'Select the matching PNG, JPG, or WebP file during import.'],
        ['card_id', 'Stable unique ID', 'Recommended', 100, 'Used to detect duplicates inside this project.'],
        ['card_kind', 'organism or effect (metadata)', 'No', '', 'Defaults to organism.'],
        ['copies', 'Number of physical copies', 'No', '', 'Whole number 1–999; defaults to 1.'],
        ['theme', 'Approved color theme', 'No', '', ', '.join(template['themes'])],
        ['TEXT FIT', 'Limits do not guarantee that every phrase fits.', '', '', 'Check the card preview. Text is never shortened or shrunk automatically.'],
    ])
    out = BytesIO()
    with ZipFile(out, 'w', ZIP_DEFLATED) as archive:
        archive.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>')
        archive.writestr('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>')
        archive.writestr('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Cards" sheetId="1" r:id="rId1"/><sheet name="Field guide" sheetId="2" r:id="rId2"/></sheets></workbook>')
        archive.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        archive.writestr('xl/styles.xml', '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/><color rgb="FF174F8A"/></font><font><b/><sz val="11"/><name val="Arial"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF284B3B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="49" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>')
        archive.writestr('xl/worksheets/sheet1.xml', worksheet([headers] + [[''] * len(headers) for _ in range(20)], [25] * len(headers)))
        archive.writestr('xl/worksheets/sheet2.xml', worksheet(guide, [24, 45, 14, 18, 65]))
    return out.getvalue()
