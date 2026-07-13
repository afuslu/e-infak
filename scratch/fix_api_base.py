import os

path = "/Users/ahmetfatihuslu/Desktop/Projelerim/e-infak/apps/web"

target1 = "process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'"
replacement1 = "(typeof window !== 'undefined' ? window.location.origin : '') || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8020'"

target2 = "process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'"
replacement2 = "(typeof window !== 'undefined' ? window.location.origin : '') || process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8020'"

count = 0
for root, dirs, files in os.walk(path):
    if ".next" in root or "node_modules" in root:
        continue
    for file in files:
        if file.endswith(('.tsx', '.ts')):
            filepath = os.path.join(root, file)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            modified = False
            if target1 in content:
                content = content.replace(target1, replacement1)
                modified = True
            if target2 in content:
                content = content.replace(target2, replacement2)
                modified = True
                
            if modified:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                print(f"Updated: {filepath}")
                count += 1

print(f"Total files updated: {count}")
