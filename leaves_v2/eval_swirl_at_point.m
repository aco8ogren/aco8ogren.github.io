function v_air = eval_swirl_at_point(swirl, x, y, z, t) %#ok<INUSD>
% EVAL_SWIRL_AT_POINT  Evaluate a Swirl object's velocity field.
%
%   v_air = eval_swirl_at_point(swirl, x, y, z, t)
%
% Inputs
%   swirl : Swirl object
%   x,y,z : coordinate arrays or scalars (same size)
%   t     : time [s] (kept for API parity; static swirl so ignored)
%
% Output
%   v_air : 3×N matrix  (row 1 = u, 2 = v, 3 = w), column-stacked.

% --- unpack parameters -------------------------------------------------
c  = swirl.centre;
n  = swirl.axis(:).';               % unit row vector
R  = swirl.R;
U0 = swirl.U0;

% --- displacement ------------------------------------------------------
rx = x - c(1);
ry = y - c(2);
rz = z - c(3);

r2 = rx.^2 + ry.^2 + rz.^2;
r  = sqrt(r2) + eps;                % avoid divide-by-zero

rxh = rx ./ r;  ryh = ry ./ r;  rzh = rz ./ r;

% --- cross( n , r̂ ) components ----------------------------------------
cx = n(2).*rzh - n(3).*ryh;
cy = n(3).*rxh - n(1).*rzh;
cz = n(1).*ryh - n(2).*rxh;

% --- Gaussian envelope -------------------------------------------------
env = U0 .* exp( -0.5 * (r ./ R).^2 );

u = env .* cx;
v = env .* cy;
w = env .* cz;

v_air = swirl.life .* [u(:).'; v(:).'; w(:).'];
end
