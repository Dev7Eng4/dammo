export default (chapterNumber, totalChapters, heading, keyPoints, chapterChars) => `では、上の企画の第${chapterNumber}章（全${totalChapters}章）「${heading}」のナレーション本文を書いてください。

この章で必ず扱うこと:
${keyPoints.map((point) => "- " + point).join("\n")}

ルール:
- 約${chapterChars}字（±15%）。
- です・ます調。視聴者に「あなた」と語りかける。1文は40字前後まで。
- 音声合成で読み上げるので、記号・英字略語・絵文字・括弧書きは使わない。英単語はカタカナで。数字は読みやすく書く。
- これまでの章で使った例や主張を繰り返さない。前の章から自然につなげる。
- 参考動画の文章や例をそのまま使わない。
${chapterNumber === 1 ? "- 最初の2〜3文で視聴者の悩みや場面に触れ、30秒以内にこの動画でわかることを約束する。章見出しは読み上げない。" : ""}
${chapterNumber === totalChapters ? "- 最後の章なので全体を短くまとめ、安心感のある言葉で締め、コメントで体験を教えてほしいと一言添える。" : ""}

出力はテキストのコードブロック1つだけ。1行に1文。説明文は不要。`;
