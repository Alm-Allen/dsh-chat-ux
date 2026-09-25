# 内嵌字体

这里的 `*.woff2` 是下面两套字体的子集，由 `scripts/subset-fonts.py` 生成，随插件一起分发：
插件把 dsh 的字体变量指到它们，所以装插件的人不必自己装字体。

| 产物 | 来源 | 许可 |
|---|---|---|
| `harmonyos-sans-sc-*.woff2` | HarmonyOS Sans SC（华为） | 华为发布的免费字体，允许免费使用与再分发，以官方发布页的许可条款为准 |
| `maple-mono-nf-cn-*.woff2` | Maple Mono NF CN（subframe7536/maple-font） | SIL Open Font License 1.1 |

子集范围：GB2312 全集（6763 个汉字与符号区的标点、序号）、拉丁与常用符号；等宽那两套另外保留
Nerd Font 的图标区。范围与参数见 `scripts/subset-fonts.py`。

`gb2312.txt` 是生成过程中的临时字符集文件，脚本结束时会删掉，不用提交。
