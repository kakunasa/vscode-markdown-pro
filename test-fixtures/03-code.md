# 代码块测试

## TypeScript

```typescript
interface User {
  id: number;
  name: string;
  email?: string;
}

async function getUser(id: number): Promise<User | null> {
  const res = await fetch(`/api/users/${id}`);
  if (!res.ok) return null;
  return res.json();
}
```

## Python

```python
def fibonacci(n: int) -> list[int]:
    """Return the first n Fibonacci numbers."""
    if n <= 0:
        return []
    seq = [0, 1]
    while len(seq) < n:
        seq.append(seq[-1] + seq[-2])
    return seq[:n]

print(fibonacci(10))
```

## Shell

```bash
#!/bin/bash
set -euo pipefail

for f in *.md; do
  echo "Processing $f..."
  pandoc -f markdown -t html -o "${f%.md}.html" "$f"
done
```

## 无语言标记

```
这是一段没有语言标记的代码块
应该用等宽字体显示
保留 缩进 和 空格
```
