const functionTypes = ['ArrowFunctionExpression', 'FunctionExpression']
const callExpressions = ['JSXExpressionContainer', 'CallExpression']
export const PROXY_RENDER_PHASE_MESSAGE =
  'Using proxies in the render phase would cause unexpected problems.'
export const SNAPSHOT_CALLBACK_MESSAGE = 'Better to just use proxy state'
export const UNEXPECTED_STATE_MUTATING =
  'Unexpected state mutating( I think we have to change that'

function isSameMemmberExpression(first, second) {
  if (first.property.name === second.property.name) {
    if (
      first.object._babelType === 'MemberExpression' &&
      second.object._babelType === 'MemberExpression'
    ) {
      return isSameMemmberExpression(first.object, second.object)
    } else if (
      first.object.type === 'Identifier' &&
      second.object.type === 'Identifier'
    ) {
      return first.object.type === second.object.type
    }
  } else {
    return false
  }
  return false
}
function isUsedInUseProxy(node, scope) {
  let isUsed = false

  if (!scope) return isUsed

  scope.variables.forEach((variable) => {
    const def = variable.defs[0]
    if (!def || isUsed) return

    const init = def.node.init
    if (!init || !init.arguments) return

    if (
      (init.parent._babelType === 'CallExpression' &&
        init.parent.callee.name === 'useProxy') ||
      (init._babelType === 'CallExpression' && init.callee.name === 'useProxy')
    ) {
      if (
        init.arguments[0] &&
        init.arguments[0]._babelType === 'MemberExpression' &&
        node.parent._babelType === 'MemberExpression'
      ) {
        return (isUsed = isSameMemmberExpression(
          node.parent.parent.left,
          init.arguments[0]
        ))
      } else if (
        init.arguments[0].type === 'Identifier' &&
        node.type === 'Identifier' &&
        node.parent.type !== 'MemberExpression'
      ) {
        return (isUsed = init.arguments[0].name === node.name)
      }
    }
  })
  if (!isUsed && scope.upper)
    return (isUsed = isUsedInUseProxy(node, scope.upper))
  return isUsed
}

function which(name, scope) {
  let kind = null

  if (!scope) return kind

  scope.variables.forEach((variable) => {
    const def = variable.defs[0]
    if (!def || variable.name !== name) return

    const init = def.node.init
    if (!init) return
    if (init.type === 'Identifier') {
      return (kind = which(init.name, scope))
    } else if (init.type === 'CallExpression' && init.callee.name === 'proxy') {
      return (kind = 'state')
    } else if (
      init.type === 'CallExpression' &&
      init.callee.name === 'useProxy'
    ) {
      return (kind = 'snapshot')
    }
  })
  if (!kind && scope.upper) return (kind = which(name, scope.upper))

  return kind
}

function isInCallback(node) {
  if (!node.parent || !node.parent.type) return false

  if (
    callExpressions.includes(node.parent.type) &&
    functionTypes.includes(node.type)
  ) {
    return true
  } else {
    return isInCallback(node.parent)
  }
}

function isInRender(node) {
  if (!node.parent || !node.parent.type) return false

  if (isInCallback(node)) return false
  if (node.parent.type.toLowerCase().includes('jsx')) {
    return true
  } else {
    return isInRender(node.parent)
  }
}
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'Warns about unexpected problems',
      category: 'Unexpected Problems',
      recommended: 'true',
    },
  },
  create(context) {
    return {
      Identifier(node) {
        const scope = context.getScope(node)
        if (
          (node.parent.type === 'AssignmentExpression' ||
            (node.parent.type === 'MemberExpression' &&
              node.parent.parent.type === 'AssignmentExpression')) &&
          node.parent.object !== node &&
          isUsedInUseProxy(node, scope)
        ) {
          return context.report({
            node: node.parent.parent,
            message: UNEXPECTED_STATE_MUTATING,
          })
        }

        if (
          node.parent.type === 'MemberExpression' &&
          node.parent.property === node
        )
          return

        const kind = which(node.name, scope)
        if (kind === 'state' && isInRender(node)) {
          return context.report({
            node,
            message: PROXY_RENDER_PHASE_MESSAGE,
          })
        }
        if (kind === 'snapshot' && isInCallback(node)) {
          return context.report({
            node,
            message: SNAPSHOT_CALLBACK_MESSAGE,
          })
        }
      },
    }
  },
}
