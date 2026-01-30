import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

import Logo from './Logo.jsx';

export default function Header({ children }) {
  return (
    <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
      <Link to="/dashboard" className="flex items-center gap-3">
        <Logo size="10" className="cursor-pointer" />
      </Link>
      <div className="flex items-center gap-4">{children}</div>
    </header>
  );
}

Header.propTypes = {
  children: PropTypes.node,
};
