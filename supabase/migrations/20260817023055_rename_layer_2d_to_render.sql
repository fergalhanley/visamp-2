-- The DSL renamed `layer_2d` to `render`, so already-saved sources would no
-- longer parse. Rewrite them in place.
--
-- Word-boundary matched so an identifier that merely contains the text — a
-- variable called `layer_2d_scale`, say — is left alone. Only sources that
-- actually contain the old block keyword are touched, so this is safe to
-- re-run and is a no-op on a fresh database.

update public.visualisations
set source = regexp_replace(source, '\mlayer_2d\M', 'render', 'g')
where source ~ '\mlayer_2d\M';
