export function shouldCheckDuplicateBody(article, verifiedDuplicateTarget) {
  const target = article?.target;
  const titleOnlyDuplicate = verifiedDuplicateTarget === true
    && article?.titleOnly === true
    && target?.replaceDuplicate === true
    && target?.replaceTitleOnly === true
    && typeof target.expectedTitle === "string" && target.expectedTitle.length > 0;
  return !titleOnlyDuplicate;
}

export function isNonPersonalTitle(title) {
  return typeof title === "string" && title.trim().length > 0
    && !/\b(?:my|our|mine|ours|i|we|me|us)\b/i.test(title);
}
