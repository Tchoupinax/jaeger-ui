// Copyright (c) 2017 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint-disable */
import React from 'react';
import moment from 'moment';
import PropTypes from 'prop-types';
import dimensions from 'react-dimensions';
import { XYPlot, XAxis, YAxis, MarkSeries, Hint } from 'react-vis';
import { compose, withState, withProps } from 'recompose';

import { FALLBACK_TRACE_NAME } from '../../../constants';
import { ONE_MILLISECOND, formatDuration } from '../../../utils/date';

import './react-vis.css';
import './ScatterPlot.css';

function Graph(props) {
  const { traces } = props;
  const tracesBis = [ ...traces ];

  if (tracesBis)
    graph(tracesBis);

  return (
    <div className="TraceResultsScatterPlot">
      <div id="my_dataviz"></div>
    </div>
  );
}

const valueShape = PropTypes.shape({
  x: PropTypes.number,
  y: PropTypes.number,
  traceID: PropTypes.string,
  size: PropTypes.number,
  name: PropTypes.string,
});

Graph.propTypes = {
  tracers: PropTypes.arrayOf(valueShape),
};

Graph.defaultProps = {
  containerWidth: null,
  overValue: null,
};

const ScatterPlot = compose(
  withState('overValue', 'setOverValue', null),
  withProps(({ setOverValue }) => ({
    onValueOver: value => setOverValue(value),
    onValueOut: () => setOverValue(null),
  }))
)(Graph);

export { Graph };

export default dimensions()(ScatterPlot);

function graph(traces) {
  let result = [];
  traces.forEach((val) => {
    const spans = [ ...val.spans ];
    const request = [];
    const rest = spans;

    const firstIndex = spans.findIndex(s => s.references.length === 0);
    request.push({ ...rest[firstIndex]});
    rest.splice(firstIndex, 1);

    const { length } = rest;
    for (let i = 0; i < length; i++) {
      const nextIndex = rest.findIndex(s => s.references[0].spanID === request[i].spanID);
      if (nextIndex < 0) {
        return;
      }
      request.push(rest[nextIndex]);
      rest.splice(nextIndex, 1);
    }

    result.push(request);
  });

  const r = { ...result };

  result = result.map(trace => {
    const start = trace.shift();
    const first = start.duration;
    const time = start.startTime.toString().slice(0, -6);
    const second = trace.shift().duration;
    const third = trace.shift().duration;
    const fourth = trace.shift().duration;

    return {
      time,
      fourth,
      third: third - fourth,
      second: second - third,
      first: first - second,
    };
  });

  var i,j,temparray,chunk = 25;
  const resultAverage = [];
  for (i=0,j=result.length; i<j; i+=chunk) {
      temparray = result.slice(i,i+chunk);

      const reducer = (acc, cur) => {
        return {
          time: 0,
          fourth: acc.fourth + cur.fourth,
          third: acc.third + cur.third,
          second: acc.second + cur.second,
          first: acc.first + cur.first,
        };
      };

      const avg = temparray.reduce(reducer);
      resultAverage.push({
        time: temparray[0].time,
        fourth: avg.fourth / 1000 / chunk,
        third: avg.third / 1000 / chunk,
        second: avg.second / 1000 / chunk,
        first: avg.first / 1000 / chunk,
      });
  }

  const dataColumns = ['first', 'second', 'third', 'fourth'].reverse();
  resultAverage.columns = ['time', ...dataColumns];

  console.log(resultAverage)

  const max = Math.max(...resultAverage.map(a => a.fourth + a.third + a.second + a.first)) * 2;

  console.log(max)

  // set the dimensions and margins of the graph
  var margin = {top: 60, right: 230, bottom: 50, left: 50},
  width = 1260 - margin.left - margin.right,
  height = 400 - margin.top - margin.bottom;


  // append the svg object to the body of the page
  var svg = d3.select("#my_dataviz")
  .append("svg")
  .attr("width", width + margin.left + margin.right)
  .attr("height", height + margin.top + margin.bottom)
  .append("g")
  .attr("transform",
        "translate(" + margin.left + "," + margin.top + ")");

  // Parse the Data

  //////////
  // GENERAL //
  //////////

  // List of groups = header of the csv files
  var keys = resultAverage.columns.slice(1)

  // color palette
  var color = d3.scaleOrdinal()
  .domain(keys)
  .range(d3.schemeSet2);

  //stack the data?
  var stackedData = d3.stack()
  .keys(keys)
  (resultAverage)



  //////////
  // AXIS //
  //////////

  // Add X axis
  var x = d3.scaleLinear()
  .domain(d3.extent(resultAverage, function(d) { return d.time; }))
  .range([ 0, width ]);
  var xAxis = svg.append("g")
  .attr("transform", "translate(0," + height + ")")
  .call(d3.axisBottom(x).ticks(5))

  // Add X axis label:
  svg.append("text")
    .attr("text-anchor", "end")
    .attr("x", width)
    .attr("y", height+40 )
    .text("Time");

  // Add Y axis label:
  svg.append("text")
    .attr("text-anchor", "end")
    .attr("x", 0)
    .attr("y", -20 )
    .text("Answer time (ms)")
    .attr("text-anchor", "start")

  // Add Y axis
  var y = d3.scaleLinear()
  .domain([0, max])
  .range([ height, 0 ]);
  svg.append("g")
  .call(d3.axisLeft(y).ticks(5))

  //////////
  // BRUSHING AND CHART //
  //////////

  // Add a clipPath: everything out of this area won't be drawn.
  var clip = svg.append("defs").append("svg:clipPath")
    .attr("id", "clip")
    .append("svg:rect")
    .attr("width", width )
    .attr("height", height )
    .attr("x", 0)
    .attr("y", 0);

  // Add brushing
  var brush = d3.brushX()                 // Add the brush feature using the d3.brush function
    .extent( [ [0,0], [width,height] ] ) // initialise the brush area: start at 0,0 and finishes at width,height: it means I select the whole graph area
    .on("end", updateChart) // Each time the brush selection changes, trigger the 'updateChart' function

  // Create the scatter variable: where both the circles and the brush take place
  var areaChart = svg.append('g')
  .attr("clip-path", "url(#clip)")

  // Area generator
  var area = d3.area()
  .x(function(d) { return x(d.data.time); })
  .y0(function(d) { return y(d[0]); })
  .y1(function(d) { return y(d[1]); })

  // Show the areas
  areaChart
  .selectAll("mylayers")
  .data(stackedData)
  .enter()
  .append("path")
    .attr("class", function(d) { return "myArea " + d.key })
    .style("fill", function(d) { return color(d.key); })
    .attr("d", area)

  // Add the brushing
  areaChart
  .append("g")
    .attr("class", "brush")
    .call(brush);

  var idleTimeout
  function idled() { idleTimeout = null; }

  // A function that update the chart for given boundaries
  function updateChart() {

  extent = d3.event.selection

  // If no selection, back to initial coordinate. Otherwise, update X axis domain
  if(!extent){
    if (!idleTimeout) return idleTimeout = setTimeout(idled, 350); // This allows to wait a little bit
    x.domain(d3.extent(data, function(d) { return d.time; }))
  }else{
    x.domain([ x.invert(extent[0]), x.invert(extent[1]) ])
    areaChart.select(".brush").call(brush.move, null) // This remove the grey brush area as soon as the selection has been done
  }

  // Update axis and area position
  xAxis.transition().duration(1000).call(d3.axisBottom(x).ticks(5))
  areaChart
    .selectAll("path")
    .transition().duration(1000)
    .attr("d", area)
  }



  //////////
  // HIGHLIGHT GROUP //
  //////////

  // What to do when one group is hovered
  var highlight = function(d){
    // reduce opacity of all groups
    d3.selectAll(".myArea").style("opacity", .1)
    // expect the one that is hovered
    d3.select("."+d).style("opacity", 1)
  }

  // And when it is not hovered anymore
  var noHighlight = function(d){
    d3.selectAll(".myArea").style("opacity", 1)
  }
}