% rename_m_to_txt_uigetfile.m
% Select a .m file, then rename all .m files in that folder to .txt

% Ask user to pick a .m file
[filename, folderPath] = uigetfile('*.m', 'Select any .m file in the target folder','multiselect','on');
if isequal(filename, 0)
    disp('User canceled.');
    return;
end

% Get list of .m files in that folder
files = dir(fullfile(folderPath, '*.m'));

for k = 1:numel(files)
    oldName = fullfile(folderPath, files(k).name);
    [~, baseName, ~] = fileparts(files(k).name);
    newName = fullfile(folderPath, [baseName '.txt']);
    
    try
        movefile(oldName, newName);
        fprintf('Renamed: %s -> %s\n', files(k).name, [baseName '.txt']);
    catch ME
        warning('Could not rename %s: %s', files(k).name, ME.message);
    end
end

disp('All .m files have been renamed to .txt.');
