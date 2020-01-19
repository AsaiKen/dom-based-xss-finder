import {transform} from '@babel/core';

export default function(src) {
  const visitedKey = '__dombasedxssfinder_visited_key__';
  const plugin = ({ types: t }) => {
    function callExpression(callee, arguments_) {
      const e = t.callExpression(callee, arguments_);
      e[visitedKey] = true;
      return e;
    }

    const visitor = {
      BinaryExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          const { left, operator, right } = nodePath.node;
          let newAst;
          if (operator === '+') {
            // a + b -> __dombasedxssfinder_plus(a, b)
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_plus'),
                [left, right]
            );
          } else if (operator === '==') {
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_equal'),
                [left, right]
            );
          } else if (operator === '!=') {
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_notEqual'),
                [left, right]
            );
          } else if (operator === '===') {
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_strictEqual'),
                [left, right]
            );
          } else if (operator === '!==') {
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_strictNotEqual'),
                [left, right]
            );
          }
          if (newAst) {
            nodePath.replaceWith(newAst);
            nodePath[visitedKey] = true;
          }
        },
      },
      AssignmentExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          let { left, operator, right } = nodePath.node;
          if (operator === '+=') {
            // a += b -> a = __dombasedxssfinder_plus(a, b)
            right = callExpression(
                t.identifier('__dombasedxssfinder_plus'),
                [left, right]
            );
          } else if (operator.length >= 2 && operator.endsWith('=')) {
            const subOp = operator.slice(0, -1);
            // a -= b -> a = a - b
            right = t.binaryExpression(subOp, left, right);
          }
          let newAst;
          if (left.type === 'MemberExpression') {
            // a.b = c -> __dombasedxssfinder_put(a, b, c)
            const { object, property, computed } = left;
            let key;
            if (computed) { // a[b], a['b']
              key = property;
            } else { // a.b
              key = t.stringLiteral(property.name);
            }
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_put'),
                [object, key, right]
            );
          } else {
            const assignmentExpression = t.assignmentExpression("=", left, right);
            assignmentExpression[visitedKey] = true;
            newAst = assignmentExpression;
          }
          nodePath.replaceWith(newAst);
          nodePath[visitedKey] = true;
        }
      },
      MemberExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          const { object, property, computed } = nodePath.node;
          let key;
          if (computed) { // a[b], a['b']
            key = property;
          } else { // a.b
            key = t.stringLiteral(property.name);
          }
          const newAst = callExpression(
              t.identifier('__dombasedxssfinder_get'),
              [object, key]
          );
          nodePath.replaceWith(newAst);
          nodePath[visitedKey] = true;
        }
      },
      NewExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          const o = nodePath.node;
          const callee = o.callee;
          const arguments_ = o.arguments;
          if (callee.name === 'Function') {
            const newAst = callExpression(
                t.identifier('__dombasedxssfinder_new_Function'),
                arguments_
            );
            nodePath.replaceWith(newAst);
            nodePath[visitedKey] = true;
          }
        }
      },
      UnaryExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          const { operator, argument } = nodePath.node;
          if (operator === 'typeof') {
            let newAst;
            if (argument.type === 'Identifier') {
              const unaryExpression = t.unaryExpression('typeof', argument, true);
              unaryExpression[visitedKey] = true;
              const binaryExpression = t.binaryExpression('===', unaryExpression, t.stringLiteral('undefined'));
              binaryExpression[visitedKey] = true;
              newAst = callExpression(
                  t.identifier('__dombasedxssfinder_typeof'),
                  [
                    // aが未定義の場合、typeof aは通過するが、f(a)はエラーになる。その対応。
                    t.conditionalExpression(
                        binaryExpression,
                        t.identifier('undefined'),
                        argument
                    )
                  ]
              );
            } else {
              newAst = callExpression(
                  t.identifier('__dombasedxssfinder_typeof'),
                  [argument]
              );
            }
            nodePath.replaceWith(newAst);
            nodePath[visitedKey] = true;
          } else if (operator === 'delete') {
            if (argument.type === 'MemberExpression') {
              // delete __dombasedxssfinder_get(a, 'b')だとdeleteされないので、MemberExpressionを残す
              argument[visitedKey] = true;
            }
          }
        }
      },
      CallExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          const o = nodePath.node;
          const callee = o.callee;
          const arguments_ = o.arguments;
          let newAst;
          if (callee.type === 'MemberExpression') {
            const { object, property, computed } = callee;
            let key;
            if (computed) { // a[b], a['b']
              key = property;
            } else { // a.b
              key = t.stringLiteral(property.name);
            }
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_property_call'),
                [object, key, ...arguments_]
            );
          } else {
            newAst = callExpression(
                t.identifier('__dombasedxssfinder_call'),
                [callee, ...arguments_]
            );
          }
          nodePath.replaceWith(newAst);
          nodePath[visitedKey] = true;
        }
      },
      UpdateExpression: {
        enter: (nodePath) => {
          if (nodePath[visitedKey] || nodePath.node[visitedKey]) {
            return;
          }

          const { argument } = nodePath.node;
          if (argument.type === 'MemberExpression') {
            // __dombasedxssfinder_get(this, "activeNums")++;はエラーになるので、MemberExpressionを残す
            argument[visitedKey] = true;
          }
        }
      },
    };
    return { visitor };
  };

  try {
    const { code, map } = transform(src, {
      parserOpts: { strictMode: false },
      plugins: [plugin],
      configFile: false,
      sourceMaps: true,
      retainLines: true,
      compact: false,
    });
    // console.debug('map', map);
    return { code, map };
  } catch (e) {
    console.error(e);
    return src;
  }
};