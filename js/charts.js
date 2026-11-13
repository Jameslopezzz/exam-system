/* =========================================================
   Inline SVG / HTML chart renderers and question media
   ========================================================= */

var CHART_PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)"
];

function captionHtml(text) {
  return text ? '<figcaption class="figure-caption">' + esc(text) + "</figcaption>" : "";
}

function barChartHtml(data) {
  var max = 0;
  data.forEach(function (d) {
    if (d.value > max) max = d.value;
  });
  var cols = data
    .map(function (d, i) {
      var height = max ? (d.value / max) * 100 : 0;
      return (
        '<div class="bar-chart__col">' +
        '<span class="bar-chart__value">' + esc(d.value) + "</span>" +
        '<div class="bar-chart__bar" style="height:' +
        height +
        "%;background-color:" +
        CHART_PALETTE[i % CHART_PALETTE.length] +
        '"></div>' +
        '<span class="bar-chart__label">' + esc(d.label) + "</span>" +
        "</div>"
      );
    })
    .join("");
  return '<div class="media-frame"><div class="bar-chart">' + cols + "</div></div>";
}

function lineGraphHtml(data) {
  var max = 0;
  data.forEach(function (d) {
    if (d.value > max) max = d.value;
  });
  max = max * 1.1 || 1;

  var points = data.map(function (d, i) {
    var x = (data.length > 1 ? i / (data.length - 1) : 0) * 280 + 20;
    var y = 140 - (d.value / max) * 120;
    return { x: x, y: y, label: d.label };
  });

  var grid = "";
  for (var g = 0; g < 4; g++) {
    var gy = 20 + g * 40;
    grid +=
      '<line x1="20" x2="300" y1="' + gy + '" y2="' + gy + '" stroke="var(--border)" stroke-width="1" />';
  }

  var poly = points
    .map(function (p) {
      return p.x + "," + p.y;
    })
    .join(" ");

  var dots = points
    .map(function (p) {
      return (
        '<g><circle cx="' + p.x + '" cy="' + p.y +
        '" r="4" fill="var(--gold)" stroke="var(--primary)" stroke-width="1.5" />' +
        '<text x="' + p.x + '" y="155" text-anchor="middle" font-size="9" fill="var(--muted-foreground)">' +
        esc(p.label) +
        "</text></g>"
      );
    })
    .join("");

  return (
    '<div class="media-frame line-graph">' +
    '<svg viewBox="0 0 320 160" role="img" aria-label="Line graph of weekly averages">' +
    grid +
    '<polyline fill="none" stroke="var(--primary)" stroke-width="2.5" points="' + poly + '" />' +
    dots +
    "</svg></div>"
  );
}

function pieChartHtml(data) {
  var total = 0;
  data.forEach(function (d) {
    total += d.value;
  });
  if (!total) total = 1;

  var angle = -90;
  var paths = "";
  var legend = "";

  data.forEach(function (d, i) {
    var sweep = (d.value / total) * 360;
    var start = angle;
    angle += sweep;
    var rad = function (deg) {
      return (deg * Math.PI) / 180;
    };
    var x1 = 80 + 70 * Math.cos(rad(start));
    var y1 = 80 + 70 * Math.sin(rad(start));
    var x2 = 80 + 70 * Math.cos(rad(angle));
    var y2 = 80 + 70 * Math.sin(rad(angle));
    var large = sweep > 180 ? 1 : 0;
    var color = CHART_PALETTE[i % CHART_PALETTE.length];

    paths +=
      '<path d="M80,80 L' + x1 + "," + y1 + " A70,70 0 " + large + ",1 " + x2 + "," + y2 +
      ' Z" fill="' + color + '" stroke="var(--card)" stroke-width="1.5" />';

    legend +=
      "<li>" +
      '<span class="swatch" style="background-color:' + color + '"></span>' +
      "<span>" + esc(d.label) + "</span>" +
      '<span class="muted">' + Math.round((d.value / total) * 100) + "%</span>" +
      "</li>";
  });

  return (
    '<div class="media-frame pie-wrap">' +
    '<svg viewBox="0 0 160 160" role="img" aria-label="Pie chart of detection categories">' +
    paths +
    "</svg>" +
    '<ul class="pie-legend">' + legend + "</ul>" +
    "</div>"
  );
}

function tableHtml(media) {
  var head = media.headers
    .map(function (h) {
      return "<th>" + esc(h) + "</th>";
    })
    .join("");
  var body = media.rows
    .map(function (row) {
      return (
        "<tr>" +
        row
          .map(function (cell) {
            return "<td>" + esc(cell) + "</td>";
          })
          .join("") +
        "</tr>"
      );
    })
    .join("");
  return '<div class="scroll-x"><table class="data-table"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
}

/* Renders any question media block as HTML. */
function renderMedia(media) {
  if (!media) return "";
  var inner = "";

  if (media.kind === "image") {
    inner =
      '<img class="question-image" src="' + esc(media.src || "assets/question-diagram.jpg") +
      '" alt="' + esc(media.alt || "") + '" loading="lazy" width="1024" height="768" />';
  } else if (media.kind === "video") {
    inner =
      '<video class="question-video" controls controlsList="nodownload" src="' + esc(media.src) + '"></video>';
  } else if (media.kind === "table") {
    inner = tableHtml(media);
  } else if (media.kind === "bar-chart") {
    inner = barChartHtml(media.data);
  } else if (media.kind === "line-graph") {
    inner = lineGraphHtml(media.data);
  } else if (media.kind === "pie-chart") {
    inner = pieChartHtml(media.data);
  }

  return "<figure>" + inner + captionHtml(media.caption) + "</figure>";
}
