const isNode = (value) => typeof value === 'object' && value !== null && typeof value.type === 'string'

function isJsxChildContainer(node) {
  return node.parent?.type === 'JSXElement' || node.parent?.type === 'JSXFragment'
}

const noLiteralJsx = {
  meta: {
    type: 'problem',
    docs: { description: 'Require JSX copy to come from the i18n catalogue' },
    schema: [],
    messages: { literal: 'Put displayed text in an i18n catalogue and render it with t().' }
  },
  create(context) {
    function reportLiteral(node) {
      context.report({ node, messageId: 'literal' })
    }

    return {
      JSXText(node) {
        if (node.value.trim()) reportLiteral(node)
      },
      Literal(node) {
        const container = node.parent
        if (
          typeof node.value === 'string' &&
          container?.type === 'JSXExpressionContainer' &&
          isJsxChildContainer(container)
        ) {
          reportLiteral(node)
        }
      },
      TemplateLiteral(node) {
        const container = node.parent
        if (
          node.expressions.length === 0 &&
          container?.type === 'JSXExpressionContainer' &&
          isJsxChildContainer(container)
        ) {
          reportLiteral(node)
        }
      }
    }
  }
}

const noConcatenatedTranslation = {
  meta: {
    type: 'problem',
    docs: { description: 'Prevent concatenating translated copy' },
    schema: [],
    messages: { concatenated: 'Put the complete message in the catalogue instead of concatenating t() output.' }
  },
  create(context) {
    const visitorKeys = context.sourceCode.visitorKeys

    function containsTranslationCall(node, names) {
      if (node.type === 'CallExpression' && node.callee.type === 'Identifier' && names.has(node.callee.name)) {
        return true
      }

      return (visitorKeys[node.type] ?? []).some((key) => {
        const child = node[key]
        return Array.isArray(child)
          ? child.some((item) => isNode(item) && containsTranslationCall(item, names))
          : isNode(child) && containsTranslationCall(child, names)
      })
    }

    function visit(node, names) {
      if (
        (node.type === 'BinaryExpression' && node.operator === '+') ||
        (node.type === 'TemplateLiteral' && node.expressions.length > 0)
      ) {
        if (containsTranslationCall(node, names)) context.report({ node, messageId: 'concatenated' })
      }

      for (const key of visitorKeys[node.type] ?? []) {
        const child = node[key]
        if (Array.isArray(child)) child.filter(isNode).forEach((item) => visit(item, names))
        else if (isNode(child)) visit(child, names)
      }
    }

    return {
      'Program:exit'(program) {
        const names = new Set(
          program.body
            .filter((node) => node.type === 'ImportDeclaration' && node.source.value === '@skyclause/i18n')
            .flatMap((node) =>
              node.specifiers
                .filter((specifier) => specifier.type === 'ImportSpecifier' && specifier.imported.name === 't')
                .map((specifier) => specifier.local.name)
            )
        )

        if (names.size > 0) visit(program, names)
      }
    }
  }
}

export default {
  rules: {
    'no-literal-jsx': noLiteralJsx,
    'no-concatenated-translation': noConcatenatedTranslation
  }
}
