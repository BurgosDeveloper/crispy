function canAccessShift(user, recordShift) {
  return true;
}

function assertShiftAccess(user, recordShift) {
  return true;
}

function shiftFilter(user, column = 'shift', parameterIndex = 1) {
  return { clause: '', params: [] };
}

module.exports = { canAccessShift, assertShiftAccess, shiftFilter };