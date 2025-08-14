function v_air = eval_swirl_at_point(swirl, x, t) %#ok<INUSD>
    % EVAL_SWIRL_AT_POINT evaluate a Swirl object's velocity field.
    %
    %   v_air = eval_swirl_at_point(swirl, x, t)
    %
    % Inputs
    %   swirl : Swirl object
    %   x : N x 3 spatial coordinates [m]
    %   t : N x 1 time [s] (not actually used in this function, time is tracked internally to the Swirl)
    %
    % Output
    %   v_air : 3×N matrix  (row 1 = u, 2 = v, 3 = w), column-stacked.

    % unpack
    c  = swirl.center;
    n  = swirl.axis;
    R  = swirl.R;
    U0 = swirl.U0;

    % displacement vector from Swirl center to query points x
    r = x - c;
    r_mag = norm(r,2) + eps; % eps avoids div by zero
    r_hat = r./r_mag;

    % cross
    % expand n to be the same size as cross (only matters for vectorized
    % evaluations)
    if size(r_hat,1) > 1
        n = repmat(n,size(r_hat,1),1);
    end
    c = cross(n,r_hat);

    % gaussian envelope
    env = U0 .* exp( -0.5 * (r ./ R).^2 );

    % result
    u = env.*c;
    v_air = swirl.life .* [u(:,1) u(:,2) u(:,3)];

end
