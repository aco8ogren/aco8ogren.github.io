classdef Swirl
    % Swirl  Localised Gaussian vortex with smooth on/off envelope
    % ------------------------------------------------------------------
    properties
        centre   (1,3) double {mustBeFinite} = [0 0 0];
        axis     (1,3) double {mustBeFinite,Swirl.mustBeNonzeroVector} = [0 0 1];
        R        (1,1) double {mustBePositive}      = 1;
        U0       (1,1) double {mustBeNonnegative}   = 1;

        % ---------- new life-cycle controls ---------------------------
        duration    (1,1) double {mustBePositive}     = 6;   % total life [s]
        rise_time   (1,1) double {mustBePositive}     = 1;   % fade-in  half-width
        fall_time   (1,1) double {mustBePositive}     = 1;   % fade-out half-width
        local_time  (1,1) double {mustBeNonnegative}  = 0;   % internal clock [s]

        life        (1,1) double {mustBeGreaterThanOrEqual(life,0), ...
                                   mustBeLessThanOrEqual(life,1)} = 0;
    end

    methods
        function obj = Swirl(centre, axis, R, U0)
            if nargin == 0, return; end
            obj.centre = centre;
            obj.axis   = axis / norm(axis);
            obj.R      = R;
            obj.U0     = U0;
            obj.life   = 0;           % start invisible (fade-in next step)
        end

        function obj = advance(obj, dt)
            % increment clock & update life envelope
            obj.local_time = obj.local_time + dt;

            t  = obj.local_time;
            tf = obj.duration; % total lifespan (rise + plateau + fall)

            % life(t) =  flc2hs( t - rise/2 , rise/2 )        ...turn-on shoulder
            %          * flc2hs( tf - t - fall/2 , fall/2 )   ...turn-off shoulder
            obj.life = flc2hs( t  - obj.rise_time/2 ,  obj.rise_time/2 ) .* ...
                flc2hs( tf - t - obj.fall_time/2 ,  obj.fall_time/2 );
        end
    end

    % ---------- custom validator --------------------------------------
    methods (Static, Access = private)
        function mustBeNonzeroVector(v)
            if all(v==0), error('Swirl:AxisZero','axis must not be zero'); end
        end
    end
end
