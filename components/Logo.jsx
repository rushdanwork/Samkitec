import PropTypes from 'prop-types';

export default function Logo({ size = '10', className = '' }) {
  const sizeClass = size ? `w-${size}` : '';
  const classes = [sizeClass, className].filter(Boolean).join(' ');

  return <img src="/eye_logo.png" alt="Samkitec logo" className={classes} />;
}

Logo.propTypes = {
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
};
