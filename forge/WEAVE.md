# forge + weave

weave is the entity-level git merge driver. forge (nativelink) is the REAPI
build cache. They sit at different layers.

| Layer | Tool | What it does |
|-------|------|--------------|
| Source merge | weave | Resolves agent edit conflicts at entity level |
| Build cache | forge | Caches and executes Bazel/REAPI builds |

## Integration

### UI
Docs site: barn/nativelink/web/apps/docs/ (fumadocs).
Add content/docs/weave.mdx linking to barn/weave-sub/docs/.

### Backend
No protocol overlap. Workflow:
1. Agents edit via weave-aware git
2. Clean merges land
3. CI hits forge at :25155 for remote cache

## First-class in ranch
- barn/weave-sub (submodule)
- barn/weave (clone)
- forge/ (public entrypoint)
