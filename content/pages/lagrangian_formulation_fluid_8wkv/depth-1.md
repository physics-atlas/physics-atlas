Coordinate transformation between Euler Coords $x_i$ and lagrangian coords(initial positions) $q_i$ is:
$
\begin{equation}
x_i(\mathbf{q},t)
=
q_i+\Gamma_i(\mathbf{q},t)
\end{equation}
$
with  Jacobian determinant: $\begin{equation}
J(\mathbf{q},t)
=
\det\left(
\delta_{ij}^{\mathrm K}
+
\frac{\partial\Gamma_i}{\partial q_j}
\right)
\end{equation} $

to find density evolution from lagrangian coords:

use conservation of mass: $\begin{equation}
\rho(\mathbf{x},t)d^3x
=
\rho_{\mathrm{initial}}(\mathbf{q})d^3q
\end{equation}$
