
UPDATE public.discovered_matches
SET result_category = CASE
  WHEN lower(coalesce(notes,'') || ' ' || coalesce(source_url,'')) ~ '(deepfake|ai[- ]generated|fake video|fake celebrity|impersonat)' THEN 'impersonation'
  WHEN lower(coalesce(notes,'')) ~ '(reaction|reacts|reacting|റിയാക്ഷൻ)' THEN 'reaction'
  WHEN lower(coalesce(notes,'')) ~ '(troll|roast|meme|ട്രോൾ)' THEN 'troll'
  WHEN lower(coalesce(notes,'')) ~ '\m(news|commentary|വാർത്ത|breaking|controversy|exposed|scandal|interview|podcast)\M' THEN 'news'
  WHEN lower(coalesce(notes,'')) ~ '(full video|reupload|repost|leaked|without permission)' THEN 'reupload'
  WHEN lower(coalesce(notes,'')) ~ '(fan ?page|fanclub|fans|tribute|status|ഫാൻസ്)' THEN 'fan'
  ELSE 'needs_review'
END
WHERE source_url LIKE '%youtube.com%' AND coalesce(is_owned,false) = false;
