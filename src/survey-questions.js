export function answerQuestions(questions) {
  return questions.flatMap(question => {
    if (question.kind === 'section') return [];
    if (question.kind === 'grid') {
      return question.rows.map(row => ({ ...row, kind: 'radio', choices: question.choices }));
    }
    return [question];
  });
}
