const convertType = (value) => {
  if (value === 'undefined') return undefined;
  if (value === 'null') return null;
  if (value === 'true') return true;
  if (value === 'false') return false;
  var v = Number(value);
  return isNaN(v) ? value : v;
};

module.exports = convertType;
