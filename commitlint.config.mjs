export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'header-max-length': [2, 'always', 50]
  },
  // Dependabot's titles (#228) can't be shortened: a package name or "across 3 directories" alone can pass 50.
  // Only its two shapes are skipped, `bump <dep> from <old> to <new>…` and `bump the <group> group… with N updates`.
  ignores: [
    (message) =>
      /^(build|ci)(\([^)]*\))?: (\[security\] )?bump (\S+ from \S+ to \S+|the \S+ group .*with \d+ updates?)/.test(
        message
      )
  ]
}
