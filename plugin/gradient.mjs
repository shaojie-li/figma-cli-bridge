// A bound stop takes its RGBA, including transparency, from the variable.
export function bindStop(stop, variable, consumer) {
  const {r, g, b, a = 1} = variable.resolveForConsumer(consumer).value;
  return {...stop, color: {r,g,b,a}, boundVariables: {color: {type: 'VARIABLE_ALIAS', id: variable.id}}};
}
