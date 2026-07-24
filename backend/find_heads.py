import re, os

versions_dir = os.path.join(os.path.dirname(__file__), 'alembic', 'versions')
revs = {}
for f in os.listdir(versions_dir):
    if not f.endswith('.py') or f.startswith('__'):
        continue
    with open(os.path.join(versions_dir, f)) as fh:
        content = fh.read()
    m_rev = re.search(r"revision:\s*(?:str|Union.*?)\s*=\s*['\"](\w+)['\"]", content)
    m_down = re.search(r"down_revision.*=\s*['\"]?(\w+)['\"]?", content)
    if m_rev:
        rev = m_rev.group(1)
        down = m_down.group(1) if m_down else None
        revs[rev] = down

all_revs = set(revs.keys())
all_downs = set(v for v in revs.values() if v)
heads = all_revs - all_downs
print('Heads:', heads)
