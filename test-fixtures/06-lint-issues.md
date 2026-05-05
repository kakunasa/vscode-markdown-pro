# Lint 触发示例

打开后到 Problems 面板(Cmd+Shift+M)看 5 类警告。

## MD009 行尾多余空格

下一行末尾有 4 个空格(应为 0 或 2):    
本句末尾也是。   

## MD012 多个连续空行

上面只有一个空行,这里下面三个空行 ↓




↑ 应触发警告。

## MD018 标题井号后缺少空格

#没有空格的二级标题
正常标题 ↓

## 正常 H2

## MD001 标题层级跳跃(H2 → H4)

#### 直接跳到了 H4(应该用 H3 过渡)

## MD034 裸 URL

直接放 https://example.com 是不规范的,应该用 [example](https://example.com) 或 <https://example.com>。
