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

export function isAuthorizedManualDuplicateTitleUpdate({ eventName, ref, runNumber, expectedRunNumber, article }) {
  const target = article?.target;
  return eventName === "workflow_dispatch"
    && ref === "refs/heads/main"
    && String(runNumber || "") === String(expectedRunNumber || "")
    && String(expectedRunNumber || "").length > 0
    && article?.titleOnly === true
    && target?.replaceDuplicate === true
    && target?.replaceTitleOnly === true
    && typeof target.author === "string" && target.author.length > 0
    && typeof target.permlink === "string" && target.permlink.length > 0
    && typeof target.expectedTitle === "string" && target.expectedTitle.length > 0
    && typeof article.title === "string" && article.title.trim().length > 0;
}
