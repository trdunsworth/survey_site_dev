import json
from pathlib import Path
p = Path('src/data/survey_data.json')

data = json.loads(p.read_text())

def map_id(old):
    # keep 0 as-is
    try:
        val = float(old)
    except Exception:
        return old
    if abs(val - 0.0) < 1e-9:
        return 0
    # special: 0.1 -> 1
    if abs(val - 0.1) < 1e-9:
        return 1
    integer = int(val)
    fraction = round(val - integer, 10)
    new_val = integer + 1 + fraction
    if abs(new_val - round(new_val)) < 1e-9:
        return int(round(new_val))
    return round(new_val, 10)

# update question ids
for sec in data.get('sections', []):
    questions = sec.get('questions', [])
    for q in questions:
        if 'id' in q:
            q['id'] = map_id(q['id'])

# recursively update any showIf.questionId occurrences
def recurse(obj):
    if isinstance(obj, dict):
        for k,v in list(obj.items()):
            if k == 'questionId' and isinstance(v, (int, float)):
                obj[k] = map_id(v)
            else:
                recurse(v)
    elif isinstance(obj, list):
        for item in obj:
            recurse(item)

recurse(data)

# write back
p.write_text(json.dumps(data, indent=2, ensure_ascii=False) + '\n')

# validate
json.loads(p.read_text())
print('Renumbering complete, JSON valid')
