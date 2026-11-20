// Single source of "now" so business rules can be tested deterministically.
const clock = {
  now: () => new Date(),
};

module.exports = clock;
