type Props = {
  children: React.ReactNode;
};

/**
 * The AuthRefreshProvider wrapper is no longer needed in local mode
 * but kept for compatibility with existing component structure.
 *
 * @param children The children to render.
 */
export const AuthRefreshProvider = ({ children }: Props) => {
  return children;
};
