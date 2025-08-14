function v_air = one_swirl(x, y, z, centre, n_axis, R, U0)
% ONE_SWIRL  Localised Gaussian vortex about an arbitrary axis.
%
%   v_air = one_swirl(x,y,z, centre, n_axis, R, U0)
%
% Inputs
%   x,y,z   : coordinate arrays (same size) OR scalars  [m]
%   centre  : 1×3 [xc yc zc] – vortex centre            [m]
%   n_axis  : 1×3 unit vector – swirl axis (RH rule)
%   R       : Gaussian radius (1/e)                     [m]
%   U0      : peak tangential speed at r = R            [m/s]
%
% Output
%   v_air   : 3×N matrix of velocity components; each column [u;v;w]
%             For scalar inputs, returns a 3×1 column vector.
%
% Formula   v = U0 * exp(-(r/R)^2/2) * (n̂ × r̂)
% ---------------------------------------------------------------------

% make axis unit length, row
n_axis = n_axis(:).';
n_axis = n_axis / norm(n_axis);

% displacement
rx = x - centre(1);
ry = y - centre(2);
rz = z - centre(3);

r2 = rx.^2 + ry.^2 + rz.^2;
r  = sqrt(r2) + eps;          % avoid divide-by-zero

% unit displacement
rxh = rx ./ r;  ryh = ry ./ r;  rzh = rz ./ r;

% n × r̂
cx = n_axis(2).*rzh - n_axis(3).*ryh;
cy = n_axis(3).*rxh - n_axis(1).*rzh;
cz = n_axis(1).*ryh - n_axis(2).*rxh;

% Gaussian envelope
env = U0 .* exp(-0.5 * (r./R).^2);

% velocity components
u = env .* cx;
v = env .* cy;
w = env .* cz;

% pack as 3×N
v_air = [u(:).'; v(:).'; w(:).'];
end
