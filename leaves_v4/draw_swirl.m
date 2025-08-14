function draw_swirl(swirl)
    c = swirl.centre;
    a = swirl.axis;
    r = swirl.R;
    u = swirl.U0;
    l = swirl.life;
    scatter3(c(1),c(2),c(3),'k.')
    quiver3(c(1),c(2),c(3),l*u*a(1),l*u*a(2),l*u*a(3),'autoscale','off','color','k')
    
    [X,Y,Z] = sphere(20);

    X = X*r;
    Y = Y*r;
    Z = Z*r;

    X = X + c(1);
    Y = Y + c(2);
    Z = Z + c(3);
    
    surf(X,Y,Z,zeros(size(Z)),'FaceAlpha',l/3,'EdgeAlpha',l,'EdgeColor','none');
end

