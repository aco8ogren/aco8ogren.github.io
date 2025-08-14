function FM_jitter = leaf_jitter(leaf, gust_std, torque_std)
% Random micro-gust (force) and random torque kick.
%   gust_std   : N(0, gust_std)  per component  [N]
%   torque_std : N(0, torque_std) per component [N·m]

    F_jit = gust_std   * randn(3,1);
    M_jit = torque_std * randn(3,1);
    FM_jitter = [F_jit; M_jit];
end
