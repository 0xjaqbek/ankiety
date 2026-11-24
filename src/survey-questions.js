export function answerQuestions(questions) {
  return questions.flatMap(question => {
    if (question.kind === 'section') return [];
    if (question.kind === 'grid') {
      return question.rows.map(row => ({ ...row, kind: 'radio', choices: question.choices }));
    }
    return [question];
  });
}

function readScaleLegend(text, choices) {
  const legend = /\(\s*skala\s*:\s*([\s\S]+)\)\s*$/i.exec(text)
    || /(?:^|\n)\s*skala\s*:\s*([\s\S]+)\s*$/i.exec(text);
  if (!legend) return null;

  const list = legend[1].trim();
  const entries = [...list.matchAll(/(?:^|[,;\n])\s*([+-]?\d+)\s*[-–—=:]\s*/g)];
  if (entries[0]?.index !== 0 || entries.length !== choices.length) return null;

  const labels = entries.map((entry, index) => list
    .slice(entry.index + entry[0].length, entries[index + 1]?.index)
    .trim());
  if (entries.some((entry, index) => entry[1] !== choices[index] || !labels[index])) return null;

  return { text: text.slice(0, legend.index).trimEnd(), labels };
}

export function scalePresentation(question) {
  const { label, description = '', choices, scaleLabels = [] } = question;
  const titleLegend = readScaleLegend(label, choices);
  const descriptionLegend = readScaleLegend(description, choices);

  if (titleLegend || descriptionLegend) {
    return {
      label: titleLegend?.text || label,
      description: descriptionLegend?.text ?? description,
      labels: (titleLegend || descriptionLegend).labels,
    };
  }

  const labels = choices.map((choice, index) => {
    const endpoint = index === 0 ? scaleLabels[0] : index === choices.length - 1 ? scaleLabels[1] : '';
    return (endpoint || '').replace(/^\s*([+-]?\d+)\s*[-–—=:]\s*/, (prefix, value) => value === choice ? '' : prefix);
  });
  return { label, description, labels };
}
