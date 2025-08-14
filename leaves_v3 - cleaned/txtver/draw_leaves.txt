function draw_leaves(leaves)
    % DRAW_LEAF Draws a spade-shaped leaf object using its 3D orientation and projected position
    % This function does NOT perform physics updates; it assumes leaf state is already set.

    % Define local spade shape in 3D (XY plane at z = 0)
    [x_local, y_local] = leaf_local_coords(1); % unit size shape
    z_local = zeros(size(x_local));
    local_coords = [x_local; y_local; z_local];

    x_worlds = zeros(numel(x_local),numel(leaves));
    y_worlds = zeros(numel(x_local),numel(leaves));

    for i = 1:numel(leaves)
        leaf = leaves(i);
        % Early exit if alpha is 0 (invisible)
        if leaf.alpha <= 0
            return;
        end

        % Convert quaternion to rotation matrix (3x3)
        % q = [leaf.q1, leaf.q2, leaf.q3, leaf.q4];
        q = leaf.q;
        R = quat_to_rotation_matrix(q); % 3D rotation

        % Rotate, scale, and translate
        transformed = leaf.R * R * local_coords;
        x_world = leaf.x(1) + transformed(1, :);
        y_world = leaf.x(2) + transformed(2, :);

        x_worlds(:,i) = x_world;
        y_worlds(:,i) = y_world;
    end

    % Adjust color with alpha (simple transparency support)
    c = [0.2, 0.6, 0.2]; % blend toward white

    % Plot
    % fill(x_world, y_world, c, 'EdgeColor', 'none','FaceAlpha',leaf.alpha);

    p = patch(x_worlds, y_worlds, c, 'EdgeColor', 'none');
    p.FaceVertexAlphaData = [leaves.alpha]';
    p.AlphaDataMapping = 'none';
    p.FaceAlpha = 'flat';
    % scatter(x_world,y_world,'k.')
end

function R = quat_to_rotation_matrix(q)
    % Converts a quaternion q = [w x y z] to a 3x3 rotation matrix
    w = q(1); x = q(2); y = q(3); z = q(4);
    R = [
        1 - 2*y^2 - 2*z^2,   2*x*y - 2*z*w,     2*x*z + 2*y*w;
        2*x*y + 2*z*w,       1 - 2*x^2 - 2*z^2, 2*y*z - 2*x*w;
        2*x*z - 2*y*w,       2*y*z + 2*x*w,     1 - 2*x^2 - 2*y^2
        ];
end
