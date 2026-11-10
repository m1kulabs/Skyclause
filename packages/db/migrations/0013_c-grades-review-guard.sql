-- #161 c-grades: a review item changes only in its explanation (#79 §3 "explanation editable"), as domain_event
-- changes only in published_at: app and system keep INSERT and SELECT, and UPDATE on the explanation columns only.
-- Only retention deletes (its own grants are untouched), so an item stays for as long as its append-only grade.
REVOKE UPDATE, DELETE, TRUNCATE ON review_item FROM app, "system";
GRANT UPDATE (explanation, explained_by, explained_at, updated_at) ON review_item TO app, "system";
