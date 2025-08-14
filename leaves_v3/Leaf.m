classdef Leaf
    properties
        % Physical properties
        x double
        y double
        z double
        vx double
        vy double
        vz double
        R double              % Size (radius)
        rho double            % Area density (kg/m^2)
        mass double
        momentOfInertia double

        % Orientation
        q1 double
        q2 double
        q3 double
        q4 double
        omega (1,3) double    % Angular velocity (rad/s)
        normal (1,3) double   % Normal vector (updated externally)

        % Visualization / depth rendering parameters
        depth double
        alpha  (1,1) double {mustBeGreaterThanOrEqual(alpha,0), ...
            mustBeLessThanOrEqual(alpha,1)} = 0;
        fadingIn   logical = true;
        fadingOut  logical = false;
        fadeInSpeed  (1,1) double = 0.005;   % per step
        fadeOutSpeed (1,1) double = 0.01;    % per step


        % Aerodynamics
        Cd_perpendicular double
        Cd_parallel double
        Cn_max double
    end

    methods
        function this = Leaf()
            % Default constructor with randomized initial state
            this.x = rand();
            this.y = rand();
            this.z = 0;
            this.vx = 0.2 * (rand() - 0.5);
            this.vy = 0.5 + rand();
            this.vz = 0.1 * (rand() - 0.5);

            this.R = 0.4 + 0.2 * rand();
            this.rho = 0.01;
            area = pi * this.R^2;
            this.mass = area * this.rho;
            this.momentOfInertia = 0.5 * this.mass * this.R^2;

            this.q1 = 1;
            this.q2 = 0;
            this.q3 = 0;
            this.q4 = 0;
            this.omega = 0.01 * (rand(1,3) - 0.5);
            this.normal = [0, 0, 1];

            this.depth = 1 + 4 * rand();
            this.alpha = 1;
            this.fadingIn = true;
            this.fadingOut = false;
            this.fadeInSpeed = 0.02;
            this.fadeOutSpeed = 0.01;
        end
    end
end
