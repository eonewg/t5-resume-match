exports.widths = process.env.T5_DESKTOP === '1' ? [1920, 1440, 1366, 1280] : [1440, 1280, 390];
exports.height = width => process.env.T5_DESKTOP === '1' ? ({1920:1080, 1440:900, 1366:768, 1280:800}[width]) : width === 390 ? 844 : 1000;
