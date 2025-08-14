classdef Leaf
    properties
        % Location
        x (1,3) double
        v (1,3) double

        % Physical properties
        R (1,1) double % [m] radius
        rho (1,1) double % [kg/m^2] area density
        mass (1,1) double
        momentOfInertia (1,1) double

        % Orientation
        q (1,4) double
        omega (1,3) double % [rad/s], angular velocity
        normal (1,3) double % normal vector

        % Visualization
        alpha  (1,1) double {mustBeGreaterThanOrEqual(alpha,0), ...
            mustBeLessThanOrEqual(alpha,1)}
        fadingIn (1,1) logical
        fadingOut (1,1) logical
        fadeInSpeed  (1,1) double % delta alpha per step
        fadeOutSpeed (1,1) double % delta alpha per step


        % Aerodynamics
        Cd_perpendicular (1,1) double % perpendicular drag coeff
        Cd_parallel (1,1) double % parallel drag coeff
        Cn_max (1,1) double % max normal force coeff (lift)
        aCoP (1,1) double % CoP shift as fraction of R
    end

    methods
        function this = Leaf()
            % Constructor
        end
    end
end
